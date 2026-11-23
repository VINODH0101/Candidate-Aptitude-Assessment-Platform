import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors';
import { isOriginAllowed } from '../config/env';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const csrfOriginCheck: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const origin = req.headers.origin as string | undefined;
  if (isOriginAllowed(origin, req.protocol, req.headers.host)) {
    next();
    return;
  }

  next(new AppError(403, 'CSRF_ORIGIN', 'Request origin is not allowed'));
};
