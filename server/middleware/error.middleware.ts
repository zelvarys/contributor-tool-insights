import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { isProd } from '../config/env.js';

export function attachRequestId(req: Request, res: Response, next: NextFunction): void {
  const id = req.headers['x-request-id'];
  const requestId = typeof id === 'string' && id.length > 0 ? id : randomUUID();
  res.setHeader('X-Request-Id', requestId);
  (req as Request & { requestId: string }).requestId = requestId;
  next();
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = (req as Request & { requestId?: string }).requestId;

  // Malformed JSON body from express.json()
  if (
    err instanceof SyntaxError &&
    'body' in err &&
    (err as SyntaxError & { status?: number }).status === 400
  ) {
    res.status(400).json({
      error: {
        code: 'INVALID_JSON',
        message: 'Request body is not valid JSON',
        requestId,
      },
    });
    return;
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error(
        `[${requestId ?? 'no-req-id'}] ${err.message}`,
        err.details,
      );
    }
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
        requestId,
      },
    });
    return;
  }

  logger.error(`[${requestId ?? 'no-req-id'}] Unhandled error`, err);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: isProd ? 'Internal server error' : String(err),
      requestId,
    },
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  const requestId = (req as Request & { requestId?: string }).requestId;
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Route not found', requestId },
  });
}