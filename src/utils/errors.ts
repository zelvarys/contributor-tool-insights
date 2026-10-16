export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode = 500,
    code = 'INTERNAL_ERROR',
    details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const badRequest = (msg: string, details?: unknown) =>
  new AppError(msg, 400, 'BAD_REQUEST', details);

export const unauthorized = (msg = 'Unauthorized') =>
  new AppError(msg, 401, 'UNAUTHORIZED');

export const forbidden = (msg = 'Forbidden') =>
  new AppError(msg, 403, 'FORBIDDEN');

export const notFound = (msg = 'Not found') =>
  new AppError(msg, 404, 'NOT_FOUND');

export const conflict = (msg: string) => new AppError(msg, 409, 'CONFLICT');

export const internal = (msg = 'Internal server error') =>
  new AppError(msg, 500, 'INTERNAL_ERROR');