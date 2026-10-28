import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { getDb } from '../db/index.js';
import { SERVER_CONFIG } from '../config.js';
import { nexconnService } from '../services/nexconn.js';

const router = Router();

// Submit report (§6.7)
router.post('/', requireAuth, (req: AuthenticatedRequest, res) => {
  const { targetType, targetId, channelId, reason } = req.body;
  if (!targetType || !targetId || !reason) {
    res.status(400).json({ error: 'targetType, targetId, and reason are required' });
    return;
  }

  const db = getDb();
  const id = `rep_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  const reporterId = req.user!.userId;
  const createdAt = Date.now();

  db.prepare(`
    INSERT INTO reports (id, reporterId, targetType, targetId, channelId, reason, status, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, 'open', ?)
  `).run(id, reporterId, targetType, targetId, channelId || null, reason.slice(0, 500), createdAt);

  res.json({ success: true, reportId: id });
});

// Admin list open reports (§6.7)
router.get('/admin', (req, res) => {
  const adminToken = req.headers['x-admin-token'] || req.query.admin_token;
  if (adminToken !== SERVER_CONFIG.ADMIN_TOKEN) {
    res.status(403).json({ error: 'Unauthorized: Invalid admin token' });
    return;
  }

  const db = getDb();
  const reports = db.prepare(`
    SELECT r.*, u.handle as reporterHandle
    FROM reports r
    JOIN users u ON r.reporterId = u.id
    ORDER BY r.createdAt DESC
    LIMIT 100
  `).all();

  res.json({ reports });
});

// Block user (§6.7)
router.post('/block', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { blockedUserId } = req.body;
  if (!blockedUserId) {
    res.status(400).json({ error: 'blockedUserId is required' });
    return;
  }

  const userId = req.user!.userId;
  const db = getDb();

  db.prepare(`
    INSERT INTO blocks (userId, blockedUserId)
    VALUES (?, ?)
    ON CONFLICT(userId, blockedUserId) DO NOTHING
  `).run(userId, blockedUserId);

  // Call Server API block endpoint
  await nexconnService.blockUser(userId, blockedUserId);

  res.json({ success: true });
});

// Get user's blocked list
router.get('/blocked', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user!.userId;
  const db = getDb();

  const rows = db.prepare(`
    SELECT b.blockedUserId, u.handle
    FROM blocks b
    LEFT JOIN users u ON b.blockedUserId = u.id
    WHERE b.userId = ?
  `).all(userId) as any[];

  res.json({
    blocked: rows.map((r) => ({
      userId: r.blockedUserId,
      handle: r.handle || 'Unknown',
    })),
  });
});

export default router;
