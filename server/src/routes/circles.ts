import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { getDb } from '../db/index.js';
import { nexconnService } from '../services/nexconn.js';
import { CircleDTO, CircleMemberDTO } from '@nightwise/shared';

const router = Router();

router.get('/', requireAuth, (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const userId = req.user!.userId;

  // Find circles user is owner or member of
  const circleRow = db.prepare(`
    SELECT c.id, c.ownerId, c.nexconnGroupId
    FROM circles c
    JOIN circle_members cm ON c.id = cm.circleId
    WHERE cm.userId = ?
    LIMIT 1
  `).get(userId) as any;

  if (!circleRow) {
    res.json({ circle: null });
    return;
  }

  // Get members (Rule R1: handle only, NEVER return phone numbers of other users)
  const memberRows = db.prepare(`
    SELECT cm.userId, u.handle, cm.role, cm.joinedAt
    FROM circle_members cm
    JOIN users u ON cm.userId = u.id
    WHERE cm.circleId = ?
    ORDER BY cm.joinedAt ASC
  `).all(circleRow.id) as any[];

  const members: CircleMemberDTO[] = memberRows.map((m) => ({
    userId: m.userId,
    handle: m.handle,
    role: m.role,
    joinedAt: m.joinedAt,
  }));

  const circle: CircleDTO = {
    id: circleRow.id,
    ownerId: circleRow.ownerId,
    nexconnGroupId: circleRow.nexconnGroupId,
    members,
  };

  res.json({ circle });
});

router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const userId = req.user!.userId;
  const userHandle = req.user!.handle;

  // Check if user already owns a circle
  const existing = db.prepare('SELECT id FROM circles WHERE ownerId = ?').get(userId) as any;
  if (existing) {
    res.status(400).json({ error: 'You already have a Guardian Circle' });
    return;
  }

  const circleId = `circ_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  const nexconnGroupId = `grp_circle_${circleId}`;

  // Create group in Nexconn
  await nexconnService.createGroupChannel(
    nexconnGroupId,
    `Guardian Circle — ${userHandle}`,
    userId,
    [userId]
  );

  const now = Date.now();
  db.prepare('INSERT INTO circles (id, ownerId, nexconnGroupId) VALUES (?, ?, ?)').run(
    circleId,
    userId,
    nexconnGroupId
  );

  db.prepare('INSERT INTO circle_members (circleId, userId, role, joinedAt) VALUES (?, ?, ?, ?)').run(
    circleId,
    userId,
    'owner',
    now
  );

  const circle: CircleDTO = {
    id: circleId,
    ownerId: userId,
    nexconnGroupId,
    members: [
      {
        userId,
        handle: userHandle,
        role: 'owner',
        joinedAt: now,
      },
    ],
  };

  res.json({ circle });
});

router.post('/:id/invite', requireAuth, async (req: AuthenticatedRequest, res) => {
  const circleId = req.params.id;
  const { phone, handle } = req.body;
  const db = getDb();
  const currentUserId = req.user!.userId;

  const circle = db.prepare('SELECT * FROM circles WHERE id = ?').get(circleId) as any;
  if (!circle) {
    res.status(404).json({ error: 'Circle not found' });
    return;
  }

  // Only owner can invite
  if (circle.ownerId !== currentUserId) {
    res.status(403).json({ error: 'Only the circle owner can invite guardians' });
    return;
  }

  let targetUser: any = null;
  if (phone) {
    const cleanPhone = phone.trim().replace(/\s+/g, '');
    targetUser = db.prepare('SELECT * FROM users WHERE phone = ?').get(cleanPhone);
  } else if (handle) {
    targetUser = db.prepare('SELECT * FROM users WHERE handle = ?').get(handle.trim());
  }

  if (!targetUser) {
    res.status(404).json({ error: 'User not found. They must register for NightWise first.' });
    return;
  }

  if (targetUser.id === currentUserId) {
    res.status(400).json({ error: 'You are already the circle owner' });
    return;
  }

  // Check if already member
  const isMember = db.prepare('SELECT 1 FROM circle_members WHERE circleId = ? AND userId = ?').get(
    circleId,
    targetUser.id
  );
  if (isMember) {
    res.status(400).json({ error: 'User is already in your circle' });
    return;
  }

  // Add to DB
  db.prepare('INSERT INTO circle_members (circleId, userId, role, joinedAt) VALUES (?, ?, ?, ?)').run(
    circleId,
    targetUser.id,
    'guardian',
    Date.now()
  );

  // Add to Nexconn group channel
  await nexconnService.joinGroupChannel(circle.nexconnGroupId, [targetUser.id]);

  res.json({
    success: true,
    member: {
      userId: targetUser.id,
      handle: targetUser.handle,
      role: 'guardian',
      joinedAt: Date.now(),
    },
  });
});

router.delete('/:id/members/:userId', requireAuth, async (req: AuthenticatedRequest, res) => {
  const circleId = String(req.params.id);
  const targetUserId = String(req.params.userId);
  const db = getDb();
  const currentUserId = req.user!.userId;

  const circle = db.prepare('SELECT * FROM circles WHERE id = ?').get(circleId) as any;
  if (!circle) {
    res.status(404).json({ error: 'Circle not found' });
    return;
  }

  if (circle.ownerId !== currentUserId && currentUserId !== targetUserId) {
    res.status(403).json({ error: 'Unauthorized to remove member' });
    return;
  }

  db.prepare('DELETE FROM circle_members WHERE circleId = ? AND userId = ?').run(circleId, targetUserId);
  await nexconnService.leaveGroupChannel(circle.nexconnGroupId, [targetUserId]);

  res.json({ success: true });
});

export default router;
