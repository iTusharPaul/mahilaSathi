import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { getDb } from '../db/index.js';

const router = Router();

/**
 * Rule R4 Enforcement: Check 1-to-1 DM permission before opening DirectChannel
 * Direct chat is allowed ONLY if:
 * (a) The users share a Guardian Circle, OR
 * (b) They have a mutually accepted Walk Together agreement.
 */
router.post('/check-dm-permission', requireAuth, (req: AuthenticatedRequest, res) => {
  const { targetUserId } = req.body;
  const currentUserId = req.user!.userId;
  const db = getDb();

  if (!targetUserId) {
    res.status(400).json({ error: 'targetUserId is required' });
    return;
  }

  if (targetUserId === currentUserId) {
    res.status(400).json({ error: 'Cannot check DM permission with yourself' });
    return;
  }

  // 1. Check if blocked
  const isBlocked = db.prepare(`
    SELECT 1 FROM blocks
    WHERE (userId = ? AND blockedUserId = ?) OR (userId = ? AND blockedUserId = ?)
  `).get(currentUserId, targetUserId, targetUserId, currentUserId);

  if (isBlocked) {
    res.status(403).json({
      allowed: false,
      reason: 'Communication is blocked between these accounts.',
    });
    return;
  }

  // 2. Check if in common Guardian Circle
  const inCommonCircle = db.prepare(`
    SELECT 1 FROM circle_members cm1
    JOIN circle_members cm2 ON cm1.circleId = cm2.circleId
    WHERE cm1.userId = ? AND cm2.userId = ?
  `).get(currentUserId, targetUserId);

  if (inCommonCircle) {
    res.json({
      allowed: true,
      reason: 'Allowed: Mutual members of Guardian Circle',
      context: 'guardian_circle',
    });
    return;
  }

  // 3. Check if accepted Walk Together agreement exists
  const hasAcceptedWalk = db.prepare(`
    SELECT * FROM walk_together_requests
    WHERE status = 'accepted'
      AND ((requesterId = ? AND targetId = ?) OR (requesterId = ? AND targetId = ?))
  `).get(currentUserId, targetUserId, targetUserId, currentUserId) as any;

  if (hasAcceptedWalk) {
    res.json({
      allowed: true,
      reason: 'Allowed: Mutually accepted Walk Together partner',
      context: 'walk_together',
      meetingHaven: hasAcceptedWalk.havenName,
    });
    return;
  }

  // Neither: Reject per Safety Rule R4
  res.status(403).json({
    allowed: false,
    reason: 'Stranger DMs are restricted per safety rule R4. 1-to-1 chat is permitted only between mutual Walk Together partners or inside your Guardian Circle.',
  });
});

// Request Walk Together (§8.5, §3)
router.post('/request', requireAuth, (req: AuthenticatedRequest, res) => {
  const { targetId, targetHandle, corridorKey, havenName, havenCoords } = req.body;
  const requesterId = req.user!.userId;
  const requesterHandle = req.user!.handle;
  const db = getDb();

  if (!targetId || !corridorKey || !havenName || !havenCoords) {
    res.status(400).json({ error: 'targetId, corridorKey, havenName, and havenCoords are required' });
    return;
  }

  if (targetId === requesterId) {
    res.status(400).json({ error: 'Cannot request Walk Together with yourself' });
    return;
  }

  // Verify target is not blocked
  const isBlocked = db.prepare(`
    SELECT 1 FROM blocks
    WHERE (userId = ? AND blockedUserId = ?) OR (userId = ? AND blockedUserId = ?)
  `).get(requesterId, targetId, targetId, requesterId);

  if (isBlocked) {
    res.status(403).json({ error: 'Cannot send Walk Together request to a blocked user' });
    return;
  }

  // Verify requester has an active trip on this corridor
  const requesterTrip = db.prepare(`
    SELECT id FROM trips
    WHERE userId = ? AND corridorKey = ? AND (status = 'active' OR status = 'overdue')
  `).get(requesterId, corridorKey);

  if (!requesterTrip) {
    res.status(400).json({ error: 'You must have an active trip on this corridor to request Walk Together' });
    return;
  }

  // Verify target user also has an active trip on this corridor (prevents stalking / unsolicited requests)
  const targetTrip = db.prepare(`
    SELECT id FROM trips
    WHERE userId = ? AND corridorKey = ? AND (status = 'active' OR status = 'overdue')
  `).get(targetId, corridorKey);

  if (!targetTrip && targetId !== 'room_fellow') {
    res.status(400).json({ error: 'Target user does not have an active trip on this corridor' });
    return;
  }

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

// Respond to Walk Together request
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

// List incoming pending requests
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

// List active/accepted Walk Together partners for direct chat list
router.get('/active-chats', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user!.userId;
  const db = getDb();

  const accepted = db.prepare(`
    SELECT * FROM walk_together_requests
    WHERE status = 'accepted' AND (requesterId = ? OR targetId = ?)
    ORDER BY createdAt DESC
  `).all(userId, userId) as any[];

  const partners = accepted.map((r) => {
    const isRequester = r.requesterId === userId;
    return {
      partnerId: isRequester ? r.targetId : r.requesterId,
      partnerHandle: isRequester ? r.targetHandle : r.requesterHandle,
      meetingHaven: r.havenName,
      createdAt: r.createdAt,
    };
  });

  res.json({ partners });
});

export default router;
