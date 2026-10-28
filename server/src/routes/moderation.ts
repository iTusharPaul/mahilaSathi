import { Router } from 'express';
import { SERVER_CONFIG } from '../config.js';

const router = Router();

/**
 * Pre-message Moderation Webhook Target (§6.6, §8.4)
 * Evaluates message text before delivery when webhook moderation is enabled in Nexconn Console.
 */
router.post('/pre-message', (req, res) => {
  const { content, messageType, senderUserId, targetId } = req.body || {};
  const text = typeof content === 'string' ? content : (content?.text || content?.content || '');

  if (!text) {
    res.json({
      code: 200,
      action: 'allow',
    });
    return;
  }

  const normalized = text.toLowerCase();
  const matchedKeyword = SERVER_CONFIG.BANNED_KEYWORDS.find((keyword) =>
    normalized.includes(keyword.toLowerCase())
  );

  if (matchedKeyword) {
    console.warn(`[Moderation Webhook] Flagged message from ${senderUserId} containing restricted keyword '${matchedKeyword}'`);
    res.json({
      code: 200,
      action: 'reject',
      reason: 'Message contains prohibited content violating NightWise community safety guidelines.',
    });
    return;
  }

  res.json({
    code: 200,
    action: 'allow',
  });
});

export default router;
