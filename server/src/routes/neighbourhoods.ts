import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { getDb } from '../db/index.js';
import { SEEDED_NEIGHBOURHOODS, SERVER_CONFIG } from '../config.js';
import { CommunityReportDTO } from '@nightwise/shared';

const router = Router();

router.get('/', (req, res) => {
  const db = getDb();
  const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;

  const result = SEEDED_NEIGHBOURHOODS.map((nh) => {
    const reportCount = db.prepare(`
      SELECT COUNT(*) as count FROM community_reports
      WHERE areaLabel LIKE ? AND createdAt > ?
    `).get(`%${nh.area}%`, threeHoursAgo) as any;

    return {
      ...nh,
      activeReportsCount: reportCount?.count || 0,
      openChannelId: nh.id,
    };
  });

  res.json({ neighbourhoods: result });
});

router.post('/community-reports', requireAuth, (req: AuthenticatedRequest, res) => {
  const { category, segmentId, areaLabel, note } = req.body;
  const userId = req.user!.userId;
  const userHandle = req.user!.handle;

  if (!category || !segmentId || !areaLabel) {
    res.status(400).json({ error: 'category, segmentId, and areaLabel are required' });
    return;
  }

  // Filter note against profanity / banned keywords
  let cleanNote = note ? note.trim().slice(0, 140) : undefined;
  if (cleanNote) {
    const lower = cleanNote.toLowerCase();
    for (const b of SERVER_CONFIG.BANNED_KEYWORDS) {
      if (lower.includes(b)) {
        res.status(400).json({ error: 'Report note contains prohibited language' });
        return;
      }
    }
  }

  const db = getDb();
  const id = `crep_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  const now = Date.now();

  db.prepare(`
    INSERT INTO community_reports (id, userId, category, segmentId, areaLabel, note, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, category, segmentId, areaLabel, cleanNote || null, now);

  const reportDTO: CommunityReportDTO = {
    id,
    userId,
    userHandle,
    category,
    segmentId,
    areaLabel,
    note: cleanNote,
    createdAt: now,
  };

  res.json({ success: true, report: reportDTO });
});

router.get('/reports', (req, res) => {
  const db = getDb();
  const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;

  const reports = db.prepare(`
    SELECT cr.*, u.handle as userHandle
    FROM community_reports cr
    JOIN users u ON cr.userId = u.id
    WHERE cr.createdAt > ?
    ORDER BY cr.createdAt DESC
    LIMIT 30
  `).all(threeHoursAgo) as any[];

  res.json({ reports });
});

export default router;
