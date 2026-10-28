import { Router } from 'express';
import { requestOtp, verifyOtpAndLogin, validateHandle, createJwtToken } from '../services/auth.js';
import { nexconnService } from '../services/nexconn.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { otpRateLimiter } from '../middleware/rateLimit.js';
import { getDb } from '../db/index.js';

const router = Router();

router.post('/request-otp', otpRateLimiter, async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      res.status(400).json({ error: 'Phone number is required' });
      return;
    }
    const result = await requestOtp(phone);
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/verify-otp', async (req, res) => {
  try {
    const { phone, code } = req.body;
    if (!phone || !code) {
      res.status(400).json({ error: 'Phone and OTP code are required' });
      return;
    }
    const authResult = await verifyOtpAndLogin(phone, code);
    if (!authResult) {
      res.status(401).json({ error: 'Invalid or expired OTP code' });
      return;
    }
    res.json(authResult);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', requireAuth, (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, phone, handle, createdAt FROM users WHERE id = ?').get(req.user!.userId) as any;
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ user });
});

router.patch('/me/handle', requireAuth, (req: AuthenticatedRequest, res) => {
  const { handle } = req.body;
  const validation = validateHandle(handle);
  if (!validation.valid) {
    res.status(400).json({ error: validation.reason });
    return;
  }

  const db = getDb();
  db.prepare('UPDATE users SET handle = ? WHERE id = ?').run(handle.trim(), req.user!.userId);

  const updatedUser = db.prepare('SELECT id, phone, handle, createdAt FROM users WHERE id = ?').get(req.user!.userId) as any;
  const newJwt = createJwtToken(updatedUser);

  res.json({
    user: updatedUser,
    jwt: newJwt,
  });
});

router.post('/refresh-token', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const tokenResp = await nexconnService.issueAccessToken(req.user!.userId, req.user!.handle);
    res.json({ nexconnToken: tokenResp.token });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
