import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/index.js';
import { SERVER_CONFIG, HANDLE_WORD_LIST } from '../config.js';
import { hashOtp, smsSender } from './sms.js';
import { nexconnService } from './nexconn.js';
import { UserDTO, AuthResponseDTO } from '@nightwise/shared';

export function generatePseudonymHandle(): string {
  const word = HANDLE_WORD_LIST[Math.floor(Math.random() * HANDLE_WORD_LIST.length)];
  const num = Math.floor(Math.random() * 90) + 10; // 10-99
  return `${word}-${num}`;
}

export function validateHandle(handle: string): { valid: boolean; reason?: string } {
  if (!handle || typeof handle !== 'string') return { valid: false, reason: 'Handle is required' };
  const trimmed = handle.trim();
  if (trimmed.length < 4 || trimmed.length > 24) {
    return { valid: false, reason: 'Handle must be between 4 and 24 characters' };
  }

  // No real-name pattern: no spaces, letters, numbers, dash, underscore only
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return { valid: false, reason: 'Handle can only contain letters, numbers, hyphens, and underscores' };
  }

  // Check banned keywords
  const lower = trimmed.toLowerCase();
  for (const banned of SERVER_CONFIG.BANNED_KEYWORDS) {
    if (lower.includes(banned.toLowerCase())) {
      return { valid: false, reason: 'Handle contains inappropriate or disallowed language' };
    }
  }

  return { valid: true };
}

export function createJwtToken(user: UserDTO): string {
  return jwt.sign(
    {
      userId: user.id,
      handle: user.handle,
      phone: user.phone,
    },
    SERVER_CONFIG.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function verifyJwtToken(token: string): { userId: string; handle: string; phone: string } | null {
  try {
    return jwt.verify(token, SERVER_CONFIG.JWT_SECRET) as any;
  } catch {
    return null;
  }
}

export async function requestOtp(phone: string): Promise<{ success: boolean; demoOtp?: string; error?: string }> {
  const cleanPhone = phone.trim().replace(/\s+/g, '');
  if (!cleanPhone || cleanPhone.length < 10) {
    return { success: false, error: 'Valid phone number is required' };
  }

  const db = getDb();
  const code = SERVER_CONFIG.DEMO_MODE ? SERVER_CONFIG.DEMO_OTP : Math.floor(100000 + Math.random() * 900000).toString();
  const codeHash = hashOtp(code);
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 mins

  db.prepare(`
    INSERT INTO otps (phone, codeHash, expiresAt, attempts)
    VALUES (?, ?, ?, 0)
    ON CONFLICT(phone) DO UPDATE SET
      codeHash = excluded.codeHash,
      expiresAt = excluded.expiresAt,
      attempts = 0
  `).run(cleanPhone, codeHash, expiresAt);

  await smsSender.sendOtp(cleanPhone, code);

  return {
    success: true,
    demoOtp: SERVER_CONFIG.DEMO_MODE ? code : undefined,
  };
}

export async function verifyOtpAndLogin(phone: string, code: string): Promise<AuthResponseDTO | null> {
  const cleanPhone = phone.trim().replace(/\s+/g, '');
  const db = getDb();

  const otpRow = db.prepare('SELECT * FROM otps WHERE phone = ?').get(cleanPhone) as any;
  if (!otpRow) return null;

  if (Date.now() > otpRow.expiresAt) {
    db.prepare('DELETE FROM otps WHERE phone = ?').run(cleanPhone);
    return null;
  }

  if (otpRow.attempts >= 5) {
    db.prepare('DELETE FROM otps WHERE phone = ?').run(cleanPhone);
    return null;
  }

  const codeHash = hashOtp(code.trim());
  if (codeHash !== otpRow.codeHash) {
    db.prepare('UPDATE otps SET attempts = attempts + 1 WHERE phone = ?').run(cleanPhone);
    return null;
  }

  // OTP verified! Remove it
  db.prepare('DELETE FROM otps WHERE phone = ?').run(cleanPhone);

  // Load or create user
  let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(cleanPhone) as any;
  if (!user) {
    const userId = `nw_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    const handle = generatePseudonymHandle();
    const createdAt = Date.now();

    db.prepare('INSERT INTO users (id, phone, handle, createdAt) VALUES (?, ?, ?, ?)').run(
      userId,
      cleanPhone,
      handle,
      createdAt
    );

    user = { id: userId, phone: cleanPhone, handle, createdAt };
  }

  // Issue Nexconn Token via Server API (§6.3)
  const tokenResp = await nexconnService.issueAccessToken(user.id, user.handle);
  const jwt = createJwtToken(user);

  return {
    jwt,
    user: {
      id: user.id,
      phone: user.phone,
      handle: user.handle,
      createdAt: user.createdAt,
    },
    nexconnToken: tokenResp.token,
    demoOtp: SERVER_CONFIG.DEMO_MODE ? SERVER_CONFIG.DEMO_OTP : undefined,
  };
}
