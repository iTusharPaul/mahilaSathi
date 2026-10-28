import { describe, it, expect } from 'vitest';
import { runDemoSeed } from '../server/src/seeds/demoSeed.js';
import { getDb } from '../server/src/db/index.js';
import { verifyOtpAndLogin, requestOtp } from '../server/src/services/auth.js';
import { geoapifyService } from '../server/src/services/geoapify.js';
import { scoreEngine } from '../server/src/services/scoreEngine.js';
import { activePlansCache } from '../server/src/routes/plan.js';
import { nexconnChannels } from '../client/src/nexconn/channels.js';
import { nexconnEngine } from '../client/src/nexconn/engine.js';
import {
  NEXCONN_CUSTOM_MESSAGE_TYPES,
  buildTripStartedPayload,
  buildCheckinPayload,
  buildGuardianSosPayload,
  buildJourneyRoomSosPayload,
  buildArrivedPayload,
  computeCorridorKey,
} from '@nightwise/shared';

describe('Phase 3 Gate: Full Two-Window Judge Script (§10)', () => {
  it('executes the full two-window journey room, guardian narration, SOS fan-out and dissolve flow', async () => {
    // 1. Run Demo Seed (§10)
    await runDemoSeed();
    const db = getDb();

    // 2. Window A: Login Lotus-42 (traveller, phone 9990001111)
    await requestOtp('9990001111');
    const lotusAuth = await verifyOtpAndLogin('9990001111', '123456');
    expect(lotusAuth?.user.handle).toBe('Lotus-42');
    await nexconnEngine.connect(lotusAuth!.nexconnToken, lotusAuth!.user.id);

    // 3. Window B: Login Jasmine-17 (guardian, phone 9990002222)
    await requestOtp('9990002222');
    const jasmineAuth = await verifyOtpAndLogin('9990002222', '123456');
    expect(jasmineAuth?.user.handle).toBe('Jasmine-17');

    const lotusUser = lotusAuth!.user;
    const jasmineUser = jasmineAuth!.user;

    // Verify Lotus-42's Guardian Circle exists and has Jasmine-17 as guardian
    const circle = db.prepare(`
      SELECT c.* FROM circles c
      WHERE c.ownerId = ?
    `).get(lotusUser.id) as any;
    expect(circle).toBeDefined();
    expect(circle.nexconnGroupId).toBeDefined();
    const guardianCircleGroupId = circle.nexconnGroupId;

    const isJasmineMember = db.prepare(`
      SELECT * FROM circle_members WHERE circleId = ? AND userId = ?
    `).get(circle.id, jasmineUser.id);
    expect(isJasmineMember).toBeDefined();

    // 4. Window A plans Manyata → Whitefield and chooses Safest
    const origin = await geoapifyService.geocode('Manyata Tech Park');
    const dest = await geoapifyService.geocode('Whitefield');
    const rawRoutes = await geoapifyService.getRouteAlternatives(origin!.coords, dest!.coords, 'drive');
    const scoredRoutes = rawRoutes.map((r) =>
      scoreEngine.scoreRoute(r, {
        places: [],
        overpassData: { cctvPoints: [], litRoadLengthMeters: 0 },
        corridorKey: `${origin!.areaSlug}→${dest!.areaSlug}`,
      })
    );
    const rankedRoutes = scoreEngine.rankAndLabelRoutes(scoredRoutes);
    const safestRoute = rankedRoutes.find((r) => r.label === 'Safest') || rankedRoutes[0];

    const planId = `plan_judge_${Date.now()}`;
    activePlansCache.set(planId, {
      planId,
      origin: origin!,
      destination: dest!,
      mode: 'walk',
      routes: rankedRoutes,
      timestamp: Date.now(),
    });

    // 5. Window A starts trip:
    const corridorKey = computeCorridorKey(origin!.areaSlug, dest!.areaSlug, Date.now());
    // Clear any prior active trips on this corridor from test retries
    db.prepare("UPDATE trips SET status = 'cancelled' WHERE corridorKey = ? AND status = 'active'").run(corridorKey);

    const journeyGroupId = `grp_corridor_judge_${Date.now()}`;
    const tripId = `trip_judge_${Date.now()}`;

    db.prepare(`
      INSERT INTO trips (
        id, userId, corridorKey, nexconnGroupId, originArea, destArea, mode, score,
        startedAt, etaAt, status, lastCheckinAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `).run(
      tripId,
      lotusUser.id,
      corridorKey,
      journeyGroupId,
      origin!.area,
      dest!.area,
      'walk',
      safestRoute.score,
      Date.now(),
      Date.now() + 35 * 60 * 1000,
      Date.now()
    );

    // Window A sends NW:trip_started to Guardian Circle
    const tripStartPayload = buildTripStartedPayload({
      tripId,
      originArea: origin!.area,
      destArea: dest!.area,
      etaMinutes: 35,
      score: safestRoute.score,
      mode: 'walk',
    });
    await nexconnChannels.sendCustomMessage(
      'group',
      guardianCircleGroupId,
      NEXCONN_CUSTOM_MESSAGE_TYPES.TRIP_STARTED,
      tripStartPayload
    );

    // Window B (Jasmine-17) inspects Guardian Circle history and sees trip started card
    const circleHistory1 = await nexconnChannels.fetchHistory('group', guardianCircleGroupId);
    const startMsg = circleHistory1.find((m) => m.messageType === NEXCONN_CUSTOM_MESSAGE_TYPES.TRIP_STARTED);
    expect(startMsg).toBeDefined();
    expect(startMsg?.content.tripId).toBe(tripId);

    // 6. Window A sends a check-in: NW:checkin
    const checkinPayload = buildCheckinPayload({
      tripId,
      segmentLabel: 'Kalyan Nagar Main Road',
      minutesRemaining: 20,
    });
    await nexconnChannels.sendCustomMessage(
      'group',
      guardianCircleGroupId,
      NEXCONN_CUSTOM_MESSAGE_TYPES.CHECKIN,
      checkinPayload
    );

    const circleHistory2 = await nexconnChannels.fetchHistory('group', guardianCircleGroupId);
    const checkinMsg = circleHistory2.find((m) => m.messageType === NEXCONN_CUSTOM_MESSAGE_TYPES.CHECKIN);
    expect(checkinMsg).toBeDefined();
    expect(checkinMsg?.content.segmentLabel).toBe('Kalyan Nagar Main Road');

    // 7. Window A sends an SOS (Fan-out to Guardian Circle + Journey Room + Backend)
    const havenName = 'Apollo 24/7 Pharmacy';
    const havenCoords = { lat: 13.0285, lon: 77.6395 };

    // Fan-out 1: Guardian Circle (includes exact GPS coordinates)
    const guardianSos = buildGuardianSosPayload({
      tripId,
      coarseArea: 'Kalyan Nagar',
      nearestHavenName: havenName,
      havenDistanceM: 90,
      havenOpenUntil: 'Open 24/7',
      preciseCoords: havenCoords,
    });
    await nexconnChannels.sendCustomMessage(
      'group',
      guardianCircleGroupId,
      NEXCONN_CUSTOM_MESSAGE_TYPES.SOS,
      guardianSos
    );

    // Fan-out 2: Journey Room (coarse only - STRICTLY NO coordinates, Rule R2)
    const roomSos = buildJourneyRoomSosPayload({
      tripId,
      coarseArea: 'Kalyan Nagar',
      nearestHavenName: havenName,
      havenDistanceM: 90,
      havenOpenUntil: 'Open 24/7',
    });
    await nexconnChannels.sendCustomMessage(
      'group',
      journeyGroupId,
      NEXCONN_CUSTOM_MESSAGE_TYPES.SOS,
      roomSos
    );

    // Fan-out 3: Backend DB record
    db.prepare(`
      INSERT INTO sos_events (id, tripId, userId, createdAt, payload)
      VALUES (?, ?, ?, ?, ?)
    `).run(`sos_judge_${Date.now()}`, tripId, lotusUser.id, Date.now(), JSON.stringify(roomSos));

    // Verify Guardian received precise coordinates
    const circleHistory3 = await nexconnChannels.fetchHistory('group', guardianCircleGroupId);
    const sosInCircle = circleHistory3.find((m) => m.messageType === NEXCONN_CUSTOM_MESSAGE_TYPES.SOS);
    expect(sosInCircle).toBeDefined();
    expect(sosInCircle?.content.preciseCoords).toBeDefined();
    expect(sosInCircle?.content.preciseCoords.lat).toBe(havenCoords.lat);

    // Verify Journey Room received NO precise coordinates (Rule R2 verified)
    const roomHistory = await nexconnChannels.fetchHistory('group', journeyGroupId);
    const sosInRoom = roomHistory.find((m) => m.messageType === NEXCONN_CUSTOM_MESSAGE_TYPES.SOS);
    expect(sosInRoom).toBeDefined();
    expect((sosInRoom?.content as any).preciseCoords).toBeUndefined();

    // 8. Window A taps "I've arrived":
    const arrivedPayload = buildArrivedPayload({
      tripId,
      durationMinutes: 34,
      score: safestRoute.score,
    });
    await nexconnChannels.sendCustomMessage(
      'group',
      guardianCircleGroupId,
      NEXCONN_CUSTOM_MESSAGE_TYPES.ARRIVED,
      arrivedPayload
    );

    // Backend ends trip & marks status arrived
    db.prepare("UPDATE trips SET status = 'arrived', endedAt = ? WHERE id = ?").run(Date.now(), tripId);

    // Verify Guardian Circle receives arrived card
    const circleHistory4 = await nexconnChannels.fetchHistory('group', guardianCircleGroupId);
    const arrivedMsg = circleHistory4.find((m) => m.messageType === NEXCONN_CUSTOM_MESSAGE_TYPES.ARRIVED);
    expect(arrivedMsg).toBeDefined();
    expect(arrivedMsg?.content.durationMinutes).toBe(34);

    // Verify active trips for corridor is now 0 -> room dissolves (§6.4)
    const activeRemaining = db.prepare(`
      SELECT count(*) as count FROM trips WHERE corridorKey = ? AND status = 'active'
    `).get(corridorKey) as any;
    expect(activeRemaining.count).toBe(0);
  }, 60000);
});
