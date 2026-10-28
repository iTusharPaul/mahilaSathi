import { getDb } from '../db/index.js';
import { SERVER_CONFIG, SEEDED_NEIGHBOURHOODS } from '../config.js';
import { nexconnService } from '../services/nexconn.js';
import { geoapifyService } from '../services/geoapify.js';
import { overpassService } from '../services/overpass.js';

export async function runDemoSeed() {
  if (!SERVER_CONFIG.DEMO_MODE) return;

  const db = getDb();
  console.log('[DemoSeed] Running demo seed for Hackathon judges...');

  // 1. Seed 4 Demo Users (§10)
  const demoUsers = [
    { id: 'nw_user_lotus42', phone: '9990001111', handle: 'Lotus-42' },
    { id: 'nw_user_jasmine17', phone: '9990002222', handle: 'Jasmine-17' },
    { id: 'nw_user_neem08', phone: '9990003333', handle: 'Neem-08' },
    { id: 'nw_user_pearl23', phone: '9990004444', handle: 'Pearl-23' },
  ];

  const resolvedIds: Record<string, string> = {};

  for (const u of demoUsers) {
    const existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(u.phone) as any;
    if (existing) {
      db.prepare('UPDATE users SET handle = ? WHERE id = ?').run(u.handle, existing.id);
      resolvedIds[u.handle] = existing.id;
    } else {
      db.prepare('INSERT INTO users (id, phone, handle, createdAt) VALUES (?, ?, ?, ?)').run(
        u.id,
        u.phone,
        u.handle,
        Date.now()
      );
      resolvedIds[u.handle] = u.id;
    }

    // Register with Nexconn Server API
    await nexconnService.issueAccessToken(resolvedIds[u.handle], u.handle);
  }

  const lotusId = resolvedIds['Lotus-42'];
  const jasmineId = resolvedIds['Jasmine-17'];
  const pearlId = resolvedIds['Pearl-23'];

  // 2. Seed Pre-made Guardian Circle: Lotus-42 (traveller) with Jasmine-17 + Pearl-23 as guardians
  const circleId = 'circ_demo_lotus42';
  const circleGroupId = 'grp_circle_demo_lotus42';

  const existingCircle = db.prepare('SELECT id FROM circles WHERE ownerId = ?').get(lotusId) as any;
  if (!existingCircle) {
    db.prepare(`
      INSERT INTO circles (id, ownerId, nexconnGroupId)
      VALUES (?, ?, ?)
    `).run(circleId, lotusId, circleGroupId);

    await nexconnService.createGroupChannel(
      circleGroupId,
      'Guardian Circle — Lotus-42',
      lotusId,
      [lotusId, jasmineId, pearlId]
    );

    const now = Date.now();
    db.prepare(`
      INSERT INTO circle_members (circleId, userId, role, joinedAt)
      VALUES (?, ?, 'owner', ?)
      ON CONFLICT(circleId, userId) DO NOTHING
    `).run(circleId, lotusId, now);

    db.prepare(`
      INSERT INTO circle_members (circleId, userId, role, joinedAt)
      VALUES (?, ?, 'guardian', ?)
      ON CONFLICT(circleId, userId) DO NOTHING
    `).run(circleId, jasmineId, now);

    db.prepare(`
      INSERT INTO circle_members (circleId, userId, role, joinedAt)
      VALUES (?, ?, 'guardian', ?)
      ON CONFLICT(circleId, userId) DO NOTHING
    `).run(circleId, pearlId, now);
  }

  // 3. Seed 4 Neighbourhood OpenChannels (§10)
  for (const nh of SEEDED_NEIGHBOURHOODS) {
    await nexconnService.createOpenChannel(nh.id, nh.name);
  }

  // 4. Resolve Demo Corridor (Manyata Tech Park ↔ Whitefield) & warm cache
  try {
    const origin = await geoapifyService.geocode('Manyata Tech Park');
    const dest = await geoapifyService.geocode('Whitefield');

    if (origin && dest) {
      console.log(`[DemoSeed] Resolved Manyata Tech Park (${origin.coords.lat}, ${origin.coords.lon}) ↔ Whitefield (${dest.coords.lat}, ${dest.coords.lon})`);

      const minLon = Math.min(origin.coords.lon, dest.coords.lon) - 0.01;
      const maxLon = Math.max(origin.coords.lon, dest.coords.lon) + 0.01;
      const minLat = Math.min(origin.coords.lat, dest.coords.lat) - 0.01;
      const maxLat = Math.max(origin.coords.lat, dest.coords.lat) + 0.01;
      const bbox: [number, number, number, number] = [minLon, minLat, maxLon, maxLat];

      await Promise.all([
        geoapifyService.fetchPlacesInBbox(bbox),
        overpassService.fetchCctvAndLitData(bbox),
      ]);
      console.log('[DemoSeed] Demo corridor cache warmed successfully.');
    }
  } catch (err) {
    console.warn('[DemoSeed] Corridor warming non-blocking note:', err);
  }

  // 5. Seed 6 Prefilled Community Reports along Demo Corridor (§10)
  const reportSeed = [
    { cat: 'lively', seg: 'seg_manyata_gate', area: 'Nagavara / Manyata', note: 'Food street & tea stalls bustling outside gate 1' },
    { cat: 'place_open', seg: 'seg_kalyan_nagar', area: 'Kalyan Nagar Main Rd', note: 'Apollo 24/7 pharmacy open & well lit' },
    { cat: 'streetlight_out', seg: 'seg_hennur_underpass', area: 'Hennur Underpass', note: 'Two streetlights flickering under flyover' },
    { cat: 'lively', seg: 'seg_kammanahalli', area: 'Kammanahalli Main', note: 'Lots of people out, very well-lit stretch' },
    { cat: 'deserted', seg: 'seg_outer_ring_cross', area: 'Outer Ring Rd stretch', note: 'Quiet after 10 PM near service lane' },
    { cat: 'place_open', seg: 'seg_itpl_whitefield', area: 'ITPL Main Rd, Whitefield', note: 'Security staffed at tech park entrance' },
  ];

  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (let i = 0; i < reportSeed.length; i++) {
    const r = reportSeed[i];
    const repId = `crep_seed_${i + 1}`;
    const repTime = oneHourAgo + i * 10 * 60 * 1000;

    db.prepare(`
      INSERT INTO community_reports (id, userId, category, segmentId, areaLabel, note, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `).run(repId, jasmineId, r.cat, r.seg, r.area, r.note, repTime);
  }

  console.log('[DemoSeed] 4 Demo users, Guardian Circle, 4 Neighbourhoods, and 6 Community Reports ready!');
}
