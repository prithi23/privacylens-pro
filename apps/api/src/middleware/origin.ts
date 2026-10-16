import type { RequestHandler } from 'express';
import { HttpError } from './error.js';
export function protectWrites(origins: string[]): RequestHandler {
  return (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      next();
      return;
    }
    if (
      !req.headers.origin ||
      !origins.includes(req.headers.origin) ||
      req.headers['sec-fetch-site'] === 'cross-site'
    )
      throw new HttpError(
        403,
        'CSRF_REJECTED',
        'A trusted, same-site Origin is required for writes.',
      );
    if (!req.is('application/json'))
      throw new HttpError(
        415,
        'JSON_REQUIRED',
        'Use application/json for API writes.',
      );
    next();
  };
}
