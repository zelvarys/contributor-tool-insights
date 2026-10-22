import type { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis.js';
import { logger } from '../utils/logger.js';

export type RateLimitOptions = {
  /** Window duration in seconds. */
  windowSeconds: number;
  /** Max requests per window. */
  max: number;
  /** Prefix to namespace keys (different limiters don't collide). */
  name: string;
};

export function rateLimit(opts: RateLimitOptions) {
  return async function rateLimitMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const identity =
        req.userId ??
        (req.ip ||
          req.socket.remoteAddress ||
          'unknown');

      const windowBucket = Math.floor(Date.now() / 1000 / opts.windowSeconds);
      const key = `ratelimit:${opts.name}:${identity}:${windowBucket}`;

      const count = await redis.incr(key);
      if (count === 1) {
        // First hit in this window — set TTL slightly longer than the
        // window so the key lives past the boundary.
        await redis.expire(key, opts.windowSeconds + 1);
      }

      const remaining = Math.max(0, opts.max - count);
      res.setHeader('X-RateLimit-Limit', String(opts.max));
      res.setHeader('X-RateLimit-Remaining', String(remaining));
      res.setHeader(
        'X-RateLimit-Reset',
        String((windowBucket + 1) * opts.windowSeconds),
      );

      if (count > opts.max) {
        const retryAfter =
          (windowBucket + 1) * opts.windowSeconds -
          Math.floor(Date.now() / 1000);
        res.setHeader('Retry-After', String(Math.max(1, retryAfter)));
        res.status(429).json({
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many requests — slow down and try again shortly',
            retryAfterSeconds: Math.max(1, retryAfter),
          },
        });
        return;
      }

      next();
    } catch (err) {
      // Fail open — if Redis is down, don't block traffic.
      // Log and pass through.
      logger.warn(`rate limiter error: ${(err as Error).message}`);
      next();
    }
  };
}