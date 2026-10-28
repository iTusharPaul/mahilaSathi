import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.js';

interface RateLimitRecord {
  timestamps: number[];
}

/**
 * Lightweight in-memory rate limiter using sliding window.
 * Keeps memory footprint minimal with auto-cleanup.
 */
export function createRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
  keyGenerator: (req: Request) => string;
  message?: string;
}) {
  const store = new Map<string, RateLimitRecord>();

  // Cleanup old entries every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of store.entries()) {
      record.timestamps = record.timestamps.filter((t) => now - t < options.windowMs);
      if (record.timestamps.length === 0) {
        store.delete(key);
      }
    }
  }, 5 * 60 * 1000).unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = options.keyGenerator(req);
    if (!key) {
      next();
      return;
    }

    const now = Date.now();
    let record = store.get(key);
    if (!record) {
      record = { timestamps: [] };
      store.set(key, record);
    }

    // Filter out timestamps outside the sliding window
    record.timestamps = record.timestamps.filter((t) => now - t < options.windowMs);

    if (record.timestamps.length >= options.maxRequests) {
      const oldest = record.timestamps[0];
      const retryAfterSec = Math.ceil((options.windowMs - (now - oldest)) / 1000);
      res.setHeader('Retry-After', retryAfterSec);
      res.status(429).json({
        error: options.message || 'Too many requests. Please slow down and try again later.',
        retryAfterSec,
      });
      return;
    }

    record.timestamps.push(now);
    next();
  };
}

// 1. OTP Request Limiter: max 5 requests per 15 minutes per phone
export const otpRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 5,
  keyGenerator: (req) => {
    const phone = (req.body?.phone || '').trim().replace(/\s+/g, '');
    return phone ? `otp_${phone}` : req.ip || 'unknown';
  },
  message: 'Too many OTP requests for this phone number. Please wait 15 minutes before requesting again.',
});

// 2. Incident Report Limiter: max 10 reports per hour per user
export const reportRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 10,
  keyGenerator: (req) => (req as AuthenticatedRequest).user?.userId || req.ip || 'unknown',
  message: 'Report rate limit reached (max 10 reports per hour). Thank you for helping keep the community safe.',
});

// 3. Community Pulse Report Limiter: max 15 reports per hour per user
export const communityReportRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 15,
  keyGenerator: (req) => (req as AuthenticatedRequest).user?.userId || req.ip || 'unknown',
  message: 'Community report rate limit reached (max 15 reports per hour).',
});

// 4. SOS Limiter: max 3 triggers per 5 minutes per user (prevents infinite spamming loop while allowing emergency retries)
export const sosRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  maxRequests: 3,
  keyGenerator: (req) => (req as AuthenticatedRequest).user?.userId || req.ip || 'unknown',
  message: 'SOS trigger rate limit reached. Your guardians and corridor members have already received priority alerts.',
});
