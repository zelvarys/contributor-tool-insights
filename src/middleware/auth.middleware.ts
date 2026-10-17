import type { Request, Response, NextFunction } from 'express';
import { verifyJwt } from '../utils/jwt.js';
import { unauthorized } from '../utils/errors.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  try {
    const token = req.cookies?.token;
    if (!token || typeof token !== 'string') {
      throw unauthorized('Not authenticated');
    }
    const payload = verifyJwt(token);
    req.userId = payload.sub;
    next();
  } catch (err) {
    next(unauthorized('Invalid or expired session'));
  }
}