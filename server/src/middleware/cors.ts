import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors';
import { isOriginAllowed } from '../config/env';

const ALLOWED_METHODS = 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS';
const DEFAULT_ALLOWED_HEADERS = 'Content-Type';
const MAX_AGE_SECONDS = 86400;

/**
 * Minimal CORS handler that:
 *  - allows same-origin requests (Origin matches the request's own host),
 *  - allows origins listed in CORS_ORIGIN (reflecting CORS headers for them),
 *  - rejects any other cross-origin request with 403.
 *
 * In both local development (Vite proxy) and production (single-service Express)
 * the SPA and API share an origin, so CORS headers are only needed for the
 * optional cross-origin hosts configured via CORS_ORIGIN.
 */
export function corsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const origin = req.headers.origin as string | undefined;

  if (origin) {
    if (!isOriginAllowed(origin, req.protocol, req.headers.host)) {
      next(new AppError(403, 'CORS_FORBIDDEN', 'Origin is not allowed'));
      return;
    }

    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
    res.setHeader(
      'Access-Control-Allow-Headers',
      typeof req.headers['access-control-request-headers'] === 'string' &&
        req.headers['access-control-request-headers'].length > 0
        ? req.headers['access-control-request-headers']
        : DEFAULT_ALLOWED_HEADERS,
    );
    res.setHeader('Access-Control-Max-Age', String(MAX_AGE_SECONDS));
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
}
