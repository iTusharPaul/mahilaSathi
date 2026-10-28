import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb } from '../server/src/db/index.js';
import { runDemoSeed } from '../server/src/seeds/demoSeed.js';
import { createJwtToken } from '../server/src/services/auth.js';
import { tripGeometries } from '../server/src/routes/trips.js';
import { PRODUCT_CONSTANTS } from '@nightwise/shared';
import app from '../server/src/index.js';

let serverInstance: any;
let baseUrl = '';

async function apiRequest(path: string, options: { method?: string; token?: string; body?: any; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
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

describe('Phase 4: Safety & Abusability Gate Tests (§12 Phase 4)', () => {
  let lotusToken: string;
  let jasmineToken: string;
  let strangerToken: string;
  let lotusUser: any;
  let jasmineUser: any;
  let strangerUser: any;

  beforeAll(async () => {
    // Start ephemeral server
    await new Promise<void>((resolve) => {
      serverInstance = app.listen(0, () => {
        const port = (serverInstance.address() as any).port;
        baseUrl = `http://127.0.0.1:${port}/api`;
        resolve();
      });
    });

    await runDemoSeed();
    const db = getDb();

    // Query seeded users by phone to get canonical DB IDs
    lotusUser = db.prepare('SELECT id, phone, handle FROM users WHERE phone = ?').get('9990001111') as any;
    jasmineUser = db.prepare('SELECT id, phone, handle FROM users WHERE phone = ?').get('9990002222') as any;

    strangerUser = { id: 'nw_user_stranger99', handle: 'Stranger-99', phone: '9990009999' };
    db.prepare('INSERT OR IGNORE INTO users (id, phone, handle, createdAt) VALUES (?, ?, ?, ?)').run(
      strangerUser.id,
      strangerUser.phone,
      strangerUser.handle,
      Date.now()
    );

    lotusToken = createJwtToken(lotusUser);
    jasmineToken = createJwtToken(jasmineUser);
    strangerToken = createJwtToken(strangerUser);
  });

  afterAll(async () => {
    if (serverInstance) {
      await new Promise<void>((resolve) => serverInstance.close(() => resolve()));
    }
  });

  describe('Attack Vector (i): Try to DM a stranger (Rule R4)', () => {
    it('rejects DM permission between strangers not in a circle or walk agreement', async () => {
      const res = await apiRequest('/walk-together/check-dm-permission', {
        method: 'POST',
        token: strangerToken,
        body: { targetUserId: lotusUser.id },
      });

      expect(res.status).toBe(403);
      expect(res.body.allowed).toBe(false);
      expect(res.body.reason.toLowerCase()).toContain('r4');
    });

    it('permits DM permission for mutual members of a Guardian Circle', async () => {
      // Lotus and Jasmine share a seeded circle
      const res = await apiRequest('/walk-together/check-dm-permission', {
        method: 'POST',
        token: lotusToken,
        body: { targetUserId: jasmineUser.id },
      });

      expect(res.status).toBe(200);
      expect(res.body.allowed).toBe(true);
      expect(res.body.context).toBe('guardian_circle');
    });

    it('rejects Walk Together request if target is not on the same corridor', async () => {
      const res = await apiRequest('/walk-together/request', {
        method: 'POST',
        token: strangerToken,
        body: {
          targetId: lotusUser.id,
          targetHandle: lotusUser.handle,
          corridorKey: 'fake_corridor_key',
          havenName: 'Safe Haven',
          havenCoords: { lat: 13.0, lon: 77.6 },
        },
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('active trip');
    });
  });

  describe("Attack Vector (ii): Extract another user's precise location or phone (Rule R1, R2)", () => {
    it('ensures circle member listings NEVER return phone numbers of members', async () => {
      const res = await apiRequest('/circles', {
        token: lotusToken,
      });

      expect(res.status).toBe(200);
      const members = res.body.circle?.members || [];
      expect(members.length).toBeGreaterThan(0);

      for (const m of members) {
        expect(m).toHaveProperty('handle');
        expect(m).not.toHaveProperty('phone');
        expect(m).not.toHaveProperty('phoneNumber');
      }
    });

    it('prevents strangers from reading other users precise SOS coordinates', async () => {
      // First submit an SOS from Lotus
      await apiRequest('/sos', {
        method: 'POST',
        token: lotusToken,
        body: {
          tripId: 'trip_demo_audit',
          payload: {
            coarseArea: 'Kalyan Nagar',
            preciseCoords: { lat: 13.0285, lon: 77.6395 },
          },
        },
      });

      // Stranger queries recent SOS events
      const res = await apiRequest('/sos/recent', {
        token: strangerToken,
      });

      expect(res.status).toBe(200);
      // Stranger is not in Lotus's circle, so Lotus's SOS must not be returned to stranger
      const strangerEvents = res.body.events || [];
      const lotusEvent = strangerEvents.find((e: any) => e.senderHandle === lotusUser.handle);
      expect(lotusEvent).toBeUndefined();
    });
  });

  describe("Attack Vector (iii): See an untrimmed route that isn't yours (Rule R3)", () => {
    it('returns untrimmed geometry to trip owner, but trims 300m for anyone else', async () => {
      const db = getDb();
      const testTripId = `trip_r3_audit_${Date.now()}`;
      const mockCoords: [number, number][] = [
        [77.6200, 13.0450], // Start
        [77.6250, 13.0400],
        [77.6300, 13.0350],
        [77.6350, 13.0300],
        [77.6400, 13.0250],
        [77.7500, 12.9700], // End (~15km away)
      ];

      db.prepare(`
        INSERT INTO trips (
          id, userId, corridorKey, nexconnGroupId, originArea, destArea, mode, score,
          startedAt, etaAt, status, lastCheckinAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
      `).run(
        testTripId,
        lotusUser.id,
        'manyata-tech-park-whitefield-test',
        'grp_test',
        'Manyata Tech Park',
        'Whitefield',
        'walk',
        85,
        Date.now(),
        Date.now() + 30 * 60 * 1000,
        Date.now()
      );

      tripGeometries.set(testTripId, mockCoords);

      // Owner request
      const ownerRes = await apiRequest(`/trips/${testTripId}`, {
        token: lotusToken,
      });

      expect(ownerRes.status).toBe(200);
      expect(ownerRes.body.trip.isTrimmed).toBe(false);
      expect(ownerRes.body.trip.geometry.length).toBe(mockCoords.length);
      expect(ownerRes.body.trip.geometry[0]).toEqual(mockCoords[0]);

      // Stranger request
      const strangerRes = await apiRequest(`/trips/${testTripId}`, {
        token: strangerToken,
      });

      expect(strangerRes.status).toBe(200);
      expect(strangerRes.body.trip.isTrimmed).toBe(true);
      expect(strangerRes.body.trip.trimMetres).toBe(PRODUCT_CONSTANTS.ROUTE_TRIM_METRES);
      // Untrimmed start point should not match the trimmed start point
      expect(strangerRes.body.trip.geometry[0]).not.toEqual(mockCoords[0]);
    });
  });

  describe('Attack Vector (iv): Join or inspect Journey Room without active trip', () => {
    it('blocks corridor access and member listing for users without an active trip', async () => {
      const resAccess = await apiRequest('/trips/corridors/unregistered_corridor_key/access', {
        token: strangerToken,
      });

      expect(resAccess.status).toBe(403);
      expect(resAccess.body.allowed).toBe(false);

      const resMembers = await apiRequest('/trips/corridors/unregistered_corridor_key/members', {
        token: strangerToken,
      });

      expect(resMembers.status).toBe(403);
      expect(resMembers.body.error).toContain('Cannot view corridor members');
    });
  });

  describe('Attack Vector (v): Rate limiting, Spam & Moderation Webhook', () => {
    it('moderation webhook flags messages containing banned words (§6.6, §8.4)', async () => {
      const badRes = await apiRequest('/moderation/pre-message', {
        method: 'POST',
        body: {
          content: 'You are an asshole and I will attack you',
          senderUserId: strangerUser.id,
        },
      });

      expect(badRes.status).toBe(200);
      expect(badRes.body.action).toBe('reject');
      expect(badRes.body.reason).toContain('safety guidelines');

      const goodRes = await apiRequest('/moderation/pre-message', {
        method: 'POST',
        body: {
          content: 'Hi, I am walking near the metro station, see you at MedPlus!',
          senderUserId: lotusUser.id,
        },
      });

      expect(goodRes.status).toBe(200);
      expect(goodRes.body.action).toBe('allow');
    });

    it('protects admin reports list endpoint with ADMIN_TOKEN header', async () => {
      const unauthorizedRes = await apiRequest('/admin/reports', {
        headers: { 'x-admin-token': 'wrong_token' },
      });

      expect(unauthorizedRes.status).toBe(403);

      const authorizedRes = await apiRequest('/admin/reports', {
        headers: { 'x-admin-token': 'nightwise-admin-secret-2026' },
      });

      expect(authorizedRes.status).toBe(200);
      expect(authorizedRes.body).toHaveProperty('reports');
    });

    it('enforces OTP request rate limit on abusive spamming', async () => {
      const spamPhone = '9998887777';
      // Make 5 requests (the limit)
      for (let i = 0; i < 5; i++) {
        await apiRequest('/auth/request-otp', {
          method: 'POST',
          body: { phone: spamPhone },
        });
      }

      // 6th request must be rejected with 429
      const blockedRes = await apiRequest('/auth/request-otp', {
        method: 'POST',
        body: { phone: spamPhone },
      });
      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body.error).toContain('Too many OTP requests');
    });
  });
});
