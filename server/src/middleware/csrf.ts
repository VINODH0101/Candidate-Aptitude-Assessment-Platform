import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors';
import { allowedOrigins } from '../config/env';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const csrfOriginCheck: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const origin = req.headers.origin;
  if (typeof origin !== 'string' || origin.length === 0) {
    next();
    return;
  }

  if (allowedOrigins.includes(origin)) {
    next();
    return;
  }

  next(new AppError(403, 'CSRF_ORIGIN', 'Request origin is not allowed'));
};
