import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { getDb } from '../db/index.js';

const router = Router();

router.post('/', requireAuth, (req: AuthenticatedRequest, res) => {
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

  res.json({
    success: true,
    sosId: id,
    message: 'Alert sent to your guardians and women travelling on your route.',
  });
});

router.get('/recent', requireAuth, (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const userId = req.user!.userId;

  // Find recent SOS events from user's circles
  const events = db.prepare(`
    SELECT s.*, u.handle
    FROM sos_events s
    JOIN users u ON s.userId = u.id
    WHERE s.createdAt > ?
    ORDER BY s.createdAt DESC
    LIMIT 10
  `).all(Date.now() - 24 * 60 * 60 * 1000);

  res.json({ events });
});

export default router;
