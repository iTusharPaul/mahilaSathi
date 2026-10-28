import { describe, it, expect } from 'vitest';
import { verifyOtpAndLogin, requestOtp } from '../server/src/services/auth.js';
import { getDb } from '../server/src/db/index.js';
import { nexconnService } from '../server/src/services/nexconn.js';
import { nexconnEngine } from '../client/src/nexconn/engine.js';
import { nexconnChannels } from '../client/src/nexconn/channels.js';
import {
  NEXCONN_CUSTOM_MESSAGE_TYPES,
  buildTripStartedPayload,
  buildCheckinPayload,
  buildImOkPayload,
  buildArrivedPayload,
  buildGuardianSosPayload,
} from '../shared/src/messages.js';

describe('Phase 1 Gate: Auth, Token Flow & Guardian Trip Narration', () => {
  it('authenticates two users, creates circle, invites guardian, and narrates trip with custom cards', async () => {
    // 1. User 1 (Lotus-42) logs in
    const phone1 = '9990001111';
    await requestOtp(phone1);
    const auth1 = await verifyOtpAndLogin(phone1, '123456');
    expect(auth1).not.toBeNull();
    expect(auth1?.user.handle).toBeDefined();

    // 2. User 2 (Jasmine-17) logs in
    const phone2 = '9990002222';
    await requestOtp(phone2);
    const auth2 = await verifyOtpAndLogin(phone2, '123456');
    expect(auth2).not.toBeNull();
    expect(auth2?.user.handle).toBeDefined();

    const u1 = auth1!.user;
    const u2 = auth2!.user;

    // 3. User 1 creates a Guardian Circle
    const db = getDb();
    const ts = Date.now();
    const circleId = `circ_test_gate_${ts}`;
    const nexconnGroupId = `grp_circle_test_gate_${ts}`;

    await nexconnService.createGroupChannel(nexconnGroupId, `Guardian Circle — ${u1.handle}`, u1.id, [u1.id]);
    db.prepare('INSERT INTO circles (id, ownerId, nexconnGroupId) VALUES (?, ?, ?)').run(circleId, u1.id, nexconnGroupId);
    db.prepare('INSERT INTO circle_members (circleId, userId, role, joinedAt) VALUES (?, ?, ?, ?)').run(circleId, u1.id, 'owner', Date.now());

    // 4. User 1 invites User 2
    db.prepare('INSERT INTO circle_members (circleId, userId, role, joinedAt) VALUES (?, ?, ?, ?)').run(circleId, u2.id, 'guardian', Date.now());
    await nexconnService.joinGroupChannel(nexconnGroupId, [u2.id]);

    // 5. Connect User 1 client
    await nexconnEngine.connect(auth1!.nexconnToken, u1.id);

    // 6. User 1 narrates trip:
    // Event A: Trip Started
    const tripStartPayload = buildTripStartedPayload({
      tripId: 'trip_phase1_gate',
      originArea: 'Manyata Tech Park',
      destArea: 'Whitefield',
      etaMinutes: 40,
      score: 82,
      mode: 'walk',
    });
    const resA = await nexconnChannels.sendCustomMessage(
      'group',
      nexconnGroupId,
      NEXCONN_CUSTOM_MESSAGE_TYPES.TRIP_STARTED,
      tripStartPayload
    );
    expect(resA.success).toBe(true);

    // Event B: Check-in
    const checkinPayload = buildCheckinPayload({
      tripId: 'trip_phase1_gate',
      segmentLabel: 'Kalyan Nagar Main Road',
      minutesRemaining: 25,
      escalated: false,
    });
    const resB = await nexconnChannels.sendCustomMessage(
      'group',
      nexconnGroupId,
      NEXCONN_CUSTOM_MESSAGE_TYPES.CHECKIN,
      checkinPayload
    );
    expect(resB.success).toBe(true);

    // Event C: I'm OK
    const imOkPayload = buildImOkPayload({
      tripId: 'trip_phase1_gate',
    });
    const resC = await nexconnChannels.sendCustomMessage(
      'group',
      nexconnGroupId,
      NEXCONN_CUSTOM_MESSAGE_TYPES.IM_OK,
      imOkPayload
    );
    expect(resC.success).toBe(true);

    // Event D: SOS Alert to Guardian Circle
    const sosPayload = buildGuardianSosPayload({
      tripId: 'trip_phase1_gate',
      coarseArea: 'Kalyan Nagar',
      nearestHavenName: 'Apollo Pharmacy 24/7',
      havenDistanceM: 110,
      havenOpenUntil: 'Open 24/7',
      preciseCoords: { lat: 13.0285, lon: 77.6395 },
    });
    const resD = await nexconnChannels.sendCustomMessage(
      'group',
      nexconnGroupId,
      NEXCONN_CUSTOM_MESSAGE_TYPES.SOS,
      sosPayload
    );
    expect(resD.success).toBe(true);

    // Event E: Arrived safely
    const arrivedPayload = buildArrivedPayload({
      tripId: 'trip_phase1_gate',
      durationMinutes: 38,
      score: 82,
    });
    const resE = await nexconnChannels.sendCustomMessage(
      'group',
      nexconnGroupId,
      NEXCONN_CUSTOM_MESSAGE_TYPES.ARRIVED,
      arrivedPayload
    );
    expect(resE.success).toBe(true);

    // 7. Verify message history contains all 5 custom events in order
    const history = await nexconnChannels.fetchHistory('group', nexconnGroupId);
    expect(history.length).toBeGreaterThanOrEqual(5);

    const types = history.map((m) => m.messageType);
    expect(types).toContain(NEXCONN_CUSTOM_MESSAGE_TYPES.TRIP_STARTED);
    expect(types).toContain(NEXCONN_CUSTOM_MESSAGE_TYPES.CHECKIN);
    expect(types).toContain(NEXCONN_CUSTOM_MESSAGE_TYPES.IM_OK);
    expect(types).toContain(NEXCONN_CUSTOM_MESSAGE_TYPES.SOS);
    expect(types).toContain(NEXCONN_CUSTOM_MESSAGE_TYPES.ARRIVED);
  });
});
