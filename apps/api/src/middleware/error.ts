import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const malformed = error instanceof SyntaxError && 'body' in error;
  const tooLarge = error?.type === 'entity.too.large';
  const invalid = error instanceof ZodError;
  const conflict = error?.code === 'P2002';
  const unavailable = [
    'P1001',
    'P1002',
    'P1008',
    'P1017',
    'ECONNREFUSED',
    'ETIMEDOUT',
  ].includes(error?.code);
  const status =
    error instanceof HttpError
      ? error.status
      : invalid
        ? 400
        : conflict
          ? 409
          : unavailable
            ? 503
            : malformed
              ? 400
              : tooLarge
                ? 413
                : 500;
  // Deliberately exclude request bodies, URLs, headers, stack traces and credentials.
  if (status === 500)
    console.error(
      JSON.stringify({
        event: 'request_failed',
        requestId: res.locals.requestId,
        method: req.method,
      }),
    );
  res.status(status).json({
    error: {
      code:
        error instanceof HttpError
          ? error.code
          : invalid
            ? 'VALIDATION_ERROR'
            : conflict
              ? 'CONFLICT'
              : unavailable
                ? 'DATABASE_UNAVAILABLE'
                : malformed
                  ? 'INVALID_JSON'
                  : tooLarge
                    ? 'PAYLOAD_TOO_LARGE'
                    : 'INTERNAL_ERROR',
      message:
        status === 500
          ? 'An internal error occurred.'
          : invalid
            ? 'Invalid request parameters or body.'
            : conflict
              ? 'An account or record with those details already exists.'
              : unavailable
                ? 'Database service is unavailable.'
                : malformed
                  ? 'Request body must be valid JSON.'
                  : tooLarge
                    ? 'Request body exceeds the 64 KB limit.'
                    : error.message,
      requestId: res.locals.requestId,
    },
  });
};
