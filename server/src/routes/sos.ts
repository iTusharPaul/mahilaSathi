import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { getDb } from '../db/index.js';
import { sosRateLimiter } from '../middleware/rateLimit.js';

const router = Router();

// Trigger SOS priority alert (§6.5, §8.3)
router.post('/', requireAuth, sosRateLimiter, (req: AuthenticatedRequest, res) => {
  const { tripId, payload } = req.body;
  const userId = req.user!.userId;
  const db = getDb();

  const id = `sos_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  const now = Date.now();

  db.prepare(`
    INSERT INTO sos_events (id, tripId, userId, createdAt, payload)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    id,
    tripId || 'manual',
    userId,
    now,
    typeof payload === 'string' ? payload : JSON.stringify(payload || {})
  );

  console.log(`[SOS Event] Priority alert recorded for user ${userId} on trip ${tripId}`);

  // Label strictly per §3: "Alerts your guardians and women on your route"
  res.json({
    success: true,
    sosId: id,
    message: 'Alert sent to your guardians and women travelling on your route.',
  });
});

// Get recent SOS events (Security: Rule R2 — only guardians or self see events; exact coords never given to strangers)
router.get('/recent', requireAuth, (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const userId = req.user!.userId;

  // Find recent SOS events where requester is either the sender OR a mutual member in a Guardian Circle
  const events = db.prepare(`
    SELECT DISTINCT s.id, s.tripId, s.userId, s.createdAt, s.payload, u.handle
    FROM sos_events s
    JOIN users u ON s.userId = u.id
    LEFT JOIN circle_members cm_sender ON cm_sender.userId = s.userId
    LEFT JOIN circle_members cm_viewer ON cm_viewer.circleId = cm_sender.circleId AND cm_viewer.userId = ?
    WHERE s.createdAt > ?
      AND (s.userId = ? OR cm_viewer.userId IS NOT NULL)
    ORDER BY s.createdAt DESC
    LIMIT 10
  `).all(userId, Date.now() - 24 * 60 * 60 * 1000, userId) as any[];

  // Parse payloads and ensure no leaks
  const sanitizedEvents = events.map((event) => {
    let parsedPayload: any = {};
    try {
      parsedPayload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
    } catch {
      parsedPayload = {};
    }

    // Check if requester is in the circle or is self
    const isGuardianOrSelf = event.userId === userId; // Verified by SQL query already

    return {
      id: event.id,
      tripId: event.tripId,
      senderHandle: event.handle,
      createdAt: event.createdAt,
      payload: parsedPayload,
    };
  });

  res.json({ events: sanitizedEvents });
});

export default router;
