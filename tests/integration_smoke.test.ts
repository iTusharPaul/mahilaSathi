import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb } from '../server/src/db/index.js';
import { runDemoSeed } from '../server/src/seeds/demoSeed.js';
import app from '../server/src/index.js';

let serverInstance: any;
let baseUrl = '';

async function api(path: string, options: { method?: string; token?: string; body?: any } = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

describe('Integration Smoke Test (§11 End-to-End)', () => {
  let lotusToken: string;
  let jasmineToken: string;
  let lotusUserId: string;
  let jasmineUserId: string;

  beforeAll(async () => {
    // Start ephemeral server
    await new Promise<void>((resolve) => {
      serverInstance = app.listen(0, () => {
        const port = (serverInstance.address() as any).port;
        baseUrl = `http://127.0.0.1:${port}/api`;
        resolve();
      });
    });

    // Ensure DB & Seed are initialized in DEMO_MODE
    await runDemoSeed();
  });

  afterAll(async () => {
    if (serverInstance) {
      await new Promise<void>((resolve) => serverInstance.close(() => resolve()));
    }
  });

  it('1. Authenticates two seeded demo users via phone OTP', async () => {
    // Request OTP for Lotus-42
    const otpRes1 = await api('/auth/request-otp', {
      method: 'POST',
      body: { phone: '9990001111' },
    });
    expect(otpRes1.status).toBe(200);
    expect(otpRes1.body.demoOtp).toBe('123456');

    // Verify OTP for Lotus-42
    const loginRes1 = await api('/auth/verify-otp', {
      method: 'POST',
      body: { phone: '9990001111', code: '123456' },
    });
    expect(loginRes1.status).toBe(200);
    expect(loginRes1.body.jwt).toBeDefined();
    expect(loginRes1.body.user.handle).toBe('Lotus-42');
    expect(loginRes1.body.nexconnToken).toBeDefined();

    lotusToken = loginRes1.body.jwt;
    lotusUserId = loginRes1.body.user.id;

    // Request & Login Jasmine-17
    await api('/auth/request-otp', {
      method: 'POST',
      body: { phone: '9990002222' },
    });

    const loginRes2 = await api('/auth/verify-otp', {
      method: 'POST',
      body: { phone: '9990002222', code: '123456' },
    });
    expect(loginRes2.status).toBe(200);
    expect(loginRes2.body.user.handle).toBe('Jasmine-17');

    jasmineToken = loginRes2.body.jwt;
    jasmineUserId = loginRes2.body.user.id;
  });

  it('2. Plans demo corridor route (Manyata Tech Park → Whitefield)', async () => {
    const planRes = await api('/plan', {
      method: 'POST',
      body: {
        originText: 'Manyata Tech Park, Bengaluru',
        destText: 'Whitefield, Bengaluru',
        mode: 'walk',
      },
    });

    expect(planRes.status).toBe(200);
    expect(planRes.body.planId).toBeDefined();
    expect(planRes.body.routes.length).toBeGreaterThanOrEqual(2);

    const fastest = planRes.body.routes.find((r: any) => r.label === 'Fastest');
    const safest = planRes.body.routes.find((r: any) => r.label === 'Safest') || planRes.body.routes[0];

    expect(fastest).toBeDefined();
    expect(safest).toBeDefined();
    expect(safest.score).toBeGreaterThanOrEqual(0);
    expect(safest.score).toBeLessThanOrEqual(100);
    expect(safest.breakdown).toBeDefined();
    expect(safest.breakdown.communityPulse).toBeDefined();
    expect(Array.isArray(safest.safeHavens)).toBe(true);
    expect(safest.confidence).toBeDefined();
  }, 45000); // 45s for network routing if cache miss

  it('3. Starts trip, registers in active registry, and maps corridor Journey Room', async () => {
    // Generate fresh plan
    const planRes = await api('/plan', {
      method: 'POST',
      body: {
        originText: 'Manyata Tech Park, Bengaluru',
        destText: 'Whitefield, Bengaluru',
        mode: 'walk',
      },
    });

    const planId = planRes.body.planId;
    const safestRoute = planRes.body.routes.find((r: any) => r.label === 'Safest') || planRes.body.routes[0];

    // Start trip
    const tripRes = await api('/trips', {
      method: 'POST',
      token: lotusToken,
      body: {
        planId,
        routeId: safestRoute.id,
      },
    });

    expect(tripRes.status).toBe(200);
    expect(tripRes.body.trip).toBeDefined();
    expect(tripRes.body.trip.status).toBe('active');
    expect(tripRes.body.journeyGroupId).toBeDefined();
    expect(tripRes.body.circleGroupId).toBeDefined();
    expect(tripRes.body.headcount).toBeGreaterThanOrEqual(1);

    const activeTripId = tripRes.body.trip.id;
    const corridorKey = tripRes.body.trip.corridorKey;

    // Verify trip is in DB
    const db = getDb();
    const tripInDb = db.prepare('SELECT * FROM trips WHERE id = ?').get(activeTripId) as any;
    expect(tripInDb).toBeDefined();
    expect(tripInDb.status).toBe('active');

    // Verify corridor mapping exists
    const corridorInDb = db.prepare('SELECT * FROM corridors WHERE corridorKey = ?').get(corridorKey) as any;
    expect(corridorInDb).toBeDefined();
    expect(corridorInDb.nexconnGroupId).toBe(tripRes.body.journeyGroupId);

    // 4. Check-in heartbeat
    const checkinRes = await api(`/trips/${activeTripId}/checkin`, {
      method: 'POST',
      token: lotusToken,
    });
    expect(checkinRes.status).toBe(200);
    expect(checkinRes.body.success).toBe(true);

    // 5. Priority SOS fan-out
    const sosRes = await api('/sos', {
      method: 'POST',
      token: lotusToken,
      body: {
        tripId: activeTripId,
        payload: {
          coarseArea: 'Kalyan Nagar',
          nearestHavenName: safestRoute.safeHavens[0]?.name || 'Safe Haven',
        },
      },
    });
    expect(sosRes.status).toBe(200);
    expect(sosRes.body.success).toBe(true);
    expect(sosRes.body.message).toContain('Alert sent to your guardians and women');

    // 6. End trip (Arrived safely)
    const endRes = await api(`/trips/${activeTripId}/end`, {
      method: 'POST',
      token: lotusToken,
      body: { status: 'arrived' },
    });
    expect(endRes.status).toBe(200);
    expect(endRes.body.status).toBe('arrived');

    // Verify trip marked arrived in DB
    const endedTripInDb = db.prepare('SELECT status FROM trips WHERE id = ?').get(activeTripId) as any;
    expect(endedTripInDb.status).toBe('arrived');
  }, 45000);
});
