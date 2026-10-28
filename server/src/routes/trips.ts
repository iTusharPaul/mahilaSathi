import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { getDb } from '../db/index.js';
import { nexconnService } from '../services/nexconn.js';
import { computeCorridorKey, TripDTO } from '@nightwise/shared';
import { activePlansCache } from './plan.js';

const router = Router();

// Start a new trip (§6.4, §8.3)
router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { planId, routeId } = req.body;
    const userId = req.user!.userId;
    const userHandle = req.user!.handle;
    const db = getDb();

    const plan = activePlansCache.get(planId);
    if (!plan) {
      res.status(404).json({ error: 'Plan expired or not found. Please re-plan your route.' });
      return;
    }

    const route = plan.routes.find((r) => r.id === routeId) || plan.routes[0];
    if (!route) {
      res.status(404).json({ error: 'Route not found in plan' });
      return;
    }

    // 1. Get user's Guardian Circle group ID
    const circleRow = db.prepare(`
      SELECT c.id, c.nexconnGroupId
      FROM circles c
      JOIN circle_members cm ON c.id = cm.circleId
      WHERE cm.userId = ?
      LIMIT 1
    `).get(userId) as any;

    let circleGroupId = circleRow?.nexconnGroupId;

    // If user has no circle, auto-create one for them
    if (!circleGroupId) {
      const circleId = `circ_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
      circleGroupId = `grp_circle_${circleId}`;
      await nexconnService.createGroupChannel(circleGroupId, `Guardian Circle — ${userHandle}`, userId, [userId]);
      db.prepare('INSERT INTO circles (id, ownerId, nexconnGroupId) VALUES (?, ?, ?)').run(circleId, userId, circleGroupId);
      db.prepare('INSERT INTO circle_members (circleId, userId, role, joinedAt) VALUES (?, ?, ?, ?)').run(circleId, userId, 'owner', Date.now());
    }

    // 2. Compute Corridor Key scoped to 45-minute window (§6.4)
    const corridorKey = computeCorridorKey(plan.origin.areaSlug, plan.destination.areaSlug, Date.now());

    // 3. Find or create Journey Room for this corridor
    let corridorRow = db.prepare('SELECT * FROM corridors WHERE corridorKey = ?').get(corridorKey) as any;
    let journeyGroupId: string;

    if (corridorRow) {
      journeyGroupId = corridorRow.nexconnGroupId;
      // Add user to existing Journey Room
      await nexconnService.joinGroupChannel(journeyGroupId, [userId]);
      db.prepare('UPDATE corridors SET lastActiveAt = ? WHERE corridorKey = ?').run(Date.now(), corridorKey);
    } else {
      journeyGroupId = `grp_corridor_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
      await nexconnService.createGroupChannel(
        journeyGroupId,
        `Corridor: ${plan.origin.area} → ${plan.destination.area}`,
        userId,
        [userId]
      );
      db.prepare('INSERT INTO corridors (corridorKey, nexconnGroupId, lastActiveAt) VALUES (?, ?, ?)').run(
        corridorKey,
        journeyGroupId,
        Date.now()
      );
    }

    // 4. Register active trip in database
    const tripId = `trip_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    const now = Date.now();
    const etaMinutes = route.durationMinutes;
    const etaAt = now + etaMinutes * 60 * 1000;

    db.prepare(`
      INSERT INTO trips (
        id, userId, corridorKey, nexconnGroupId, originArea, destArea, mode, score,
        startedAt, etaAt, status, lastCheckinAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `).run(
      tripId,
      userId,
      corridorKey,
      journeyGroupId,
      plan.origin.area,
      plan.destination.area,
      plan.mode,
      route.score,
      now,
      etaAt,
      now
    );

    // 5. Query active headcount on this corridor
    const headcountRow = db.prepare(`
      SELECT COUNT(DISTINCT userId) as count
      FROM trips
      WHERE corridorKey = ? AND status = 'active'
    `).get(corridorKey) as any;

    const headcount = Math.max(1, headcountRow?.count || 1);

    const trip: TripDTO = {
      id: tripId,
      userId,
      corridorKey,
      journeyGroupId,
      circleGroupId,
      originArea: plan.origin.area,
      destArea: plan.destination.area,
      mode: plan.mode,
      score: route.score,
      startedAt: now,
      etaMinutes,
      etaAt,
      status: 'active',
      lastCheckinAt: now,
    };

    res.json({
      trip,
      journeyGroupId,
      circleGroupId,
      headcount,
      route,
      plan,
    });
  } catch (err: any) {
    console.error('[Trips API] Start error:', err);
    res.status(500).json({ error: err.message || 'Failed to start trip' });
  }
});

// Trip check-in / heartbeat (§6.5, §8.3)
router.post('/:id/checkin', requireAuth, (req: AuthenticatedRequest, res) => {
  const tripId = req.params.id;
  const db = getDb();
  const userId = req.user!.userId;

  const trip = db.prepare('SELECT * FROM trips WHERE id = ? AND userId = ?').get(tripId, userId) as any;
  if (!trip) {
    res.status(404).json({ error: 'Trip not found' });
    return;
  }

  const now = Date.now();
  db.prepare('UPDATE trips SET lastCheckinAt = ? WHERE id = ?').run(now, tripId);

  // Check if overdue: now > etaAt + 10 mins (§6.5)
  const isOverdue = now > trip.etaAt + 10 * 60 * 1000;
  if (isOverdue && trip.status === 'active') {
    db.prepare("UPDATE trips SET status = 'overdue' WHERE id = ?").run(tripId);
  }

  res.json({ success: true, lastCheckinAt: now, isOverdue });
});

// End trip (§6.4, §8.3)
router.post('/:id/end', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const tripId = req.params.id;
    const { status } = req.body; // 'arrived' or 'cancelled'
    const finalStatus = status === 'cancelled' ? 'cancelled' : 'arrived';
    const userId = req.user!.userId;
    const db = getDb();

    const trip = db.prepare('SELECT * FROM trips WHERE id = ? AND userId = ?').get(tripId, userId) as any;
    if (!trip) {
      res.status(404).json({ error: 'Trip not found' });
      return;
    }

    const now = Date.now();
    db.prepare('UPDATE trips SET status = ?, endedAt = ? WHERE id = ?').run(finalStatus, now, tripId);

    // Remove user from Journey Room
    await nexconnService.leaveGroupChannel(trip.nexconnGroupId, [userId]);

    // Check if any active trips remain on this corridor
    const remainingActive = db.prepare(`
      SELECT count(*) as count FROM trips
      WHERE corridorKey = ? AND status = 'active'
    `).get(trip.corridorKey) as any;

    if (!remainingActive || remainingActive.count === 0) {
      // Dissolve Journey Room and delete history (§6.4 ephemerality story)
      console.log(`[Journey Room] Zero active trips on corridor ${trip.corridorKey}. Dissolving room ${trip.nexconnGroupId}.`);
      await nexconnService.dismissGroupChannel(trip.nexconnGroupId);
      db.prepare('DELETE FROM corridors WHERE corridorKey = ?').run(trip.corridorKey);
    }

    res.json({
      success: true,
      status: finalStatus,
      durationMinutes: Math.max(1, Math.round((now - trip.startedAt) / 60000)),
    });
  } catch (err: any) {
    console.error('[Trips API] End trip error:', err);
    res.status(500).json({ error: err.message || 'Failed to end trip' });
  }
});

// Get current active trip for user
router.get('/active', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user!.userId;
  const db = getDb();

  const trip = db.prepare(`
    SELECT * FROM trips
    WHERE userId = ? AND (status = 'active' OR status = 'overdue')
    ORDER BY startedAt DESC
    LIMIT 1
  `).get(userId) as any;

  if (!trip) {
    res.json({ trip: null });
    return;
  }

  // Get headcount
  const headcountRow = db.prepare(`
    SELECT COUNT(DISTINCT userId) as count
    FROM trips
    WHERE corridorKey = ? AND status = 'active'
  `).get(trip.corridorKey) as any;

  res.json({
    trip: {
      id: trip.id,
      userId: trip.userId,
      corridorKey: trip.corridorKey,
      journeyGroupId: trip.nexconnGroupId,
      originArea: trip.originArea,
      destArea: trip.destArea,
      mode: trip.mode,
      score: trip.score,
      startedAt: trip.startedAt,
      etaMinutes: Math.round((trip.etaAt - trip.startedAt) / 60000),
      etaAt: trip.etaAt,
      status: trip.status,
      lastCheckinAt: trip.lastCheckinAt,
    },
    headcount: Math.max(1, headcountRow?.count || 1),
  });
});

export default router;
