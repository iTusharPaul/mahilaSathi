import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { getDb } from '../db/index.js';

const router = Router();

router.post('/request', requireAuth, (req: AuthenticatedRequest, res) => {
  const { targetId, targetHandle, corridorKey, havenName, havenCoords } = req.body;
  const requesterId = req.user!.userId;
  const requesterHandle = req.user!.handle;

  if (!targetId || !corridorKey || !havenName || !havenCoords) {
    res.status(400).json({ error: 'targetId, corridorKey, havenName, and havenCoords are required' });
    return;
  }

  if (targetId === requesterId) {
    res.status(400).json({ error: 'Cannot request Walk Together with yourself' });
    return;
  }

  const db = getDb();
  const id = `wt_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  const now = Date.now();

  db.prepare(`
    INSERT INTO walk_together_requests (
      id, requesterId, requesterHandle, targetId, targetHandle, corridorKey,
      havenName, havenLat, havenLon, status, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(
    id,
    requesterId,
    requesterHandle,
    targetId,
    targetHandle || 'Fellow Traveller',
    corridorKey,
    havenName,
    havenCoords.lat,
    havenCoords.lon,
    now
  );

  res.json({
    success: true,
    requestId: id,
    message: `Walk Together request sent to ${targetHandle || 'member'}. Meeting point: ${havenName}.`,
  });
});

router.post('/respond', requireAuth, (req: AuthenticatedRequest, res) => {
  const { requestId, accept } = req.body;
  const userId = req.user!.userId;
  const db = getDb();

  const reqRow = db.prepare('SELECT * FROM walk_together_requests WHERE id = ?').get(requestId) as any;
  if (!reqRow) {
    res.status(404).json({ error: 'Request not found' });
    return;
  }

  if (reqRow.targetId !== userId) {
    res.status(403).json({ error: 'Unauthorized to respond to this request' });
    return;
  }

  const newStatus = accept ? 'accepted' : 'declined';
  db.prepare('UPDATE walk_together_requests SET status = ? WHERE id = ?').run(newStatus, requestId);

  res.json({
    success: true,
    status: newStatus,
    directChatEnabled: accept,
    partnerId: reqRow.requesterId,
    partnerHandle: reqRow.requesterHandle,
    meetingHaven: reqRow.havenName,
  });
});

router.get('/requests', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user!.userId;
  const db = getDb();

  const incoming = db.prepare(`
    SELECT * FROM walk_together_requests
    WHERE targetId = ? AND status = 'pending'
    ORDER BY createdAt DESC
  `).all(userId);

  res.json({ requests: incoming });
});

export default router;
