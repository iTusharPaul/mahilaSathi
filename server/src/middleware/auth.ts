import { Request, Response, NextFunction } from 'express';
import { verifyJwtToken } from '../services/auth.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    handle: string;
    phone: string;
  };
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.slice(7);
  const decoded = verifyJwtToken(token);
  if (!decoded) {
    res.status(401).json({ error: 'Invalid or expired session token' });
    return;
  }

  req.user = decoded;
  next();
}
