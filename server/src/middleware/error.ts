import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { sendErrorBody } from '../lib/http';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(
    new AppError(
      404,
      'NOT_FOUND',
      `Route ${req.method} ${req.originalUrl} was not found`,
    ),
  );
};

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (res.headersSent) {
    return;
  }

  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of error.issues) {
      if (issue.code === 'unrecognized_keys') {
        for (const key of issue.keys) {
          fieldErrors[key] = 'This field is not allowed';
        }
        continue;
      }
      const key = issue.path.length > 0 ? issue.path.join('.') : '_root';
      if (!fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    sendErrorBody(
      res,
      400,
      'VALIDATION_ERROR',
      'Please fix the highlighted fields',
      fieldErrors,
    );
    return;
  }

  if (error instanceof AppError) {
    sendErrorBody(res, error.statusCode, error.code, error.message, error.details);
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      sendErrorBody(res, 409, 'DUPLICATE', 'A record with these values already exists');
      return;
    }
    if (error.code === 'P2025') {
      sendErrorBody(res, 404, 'NOT_FOUND', 'The requested record does not exist');
      return;
    }
    if (error.code === 'P2003') {
      sendErrorBody(
        res,
        409,
        'RELATION_CONFLICT',
        'This operation conflicts with related records',
      );
      return;
    }
  }

  if (error instanceof SyntaxError && 'body' in error) {
    sendErrorBody(res, 400, 'INVALID_JSON', 'Request body contains invalid JSON');
    return;
  }

  logger.error('Unhandled request error', {
    method: req.method,
    url: req.originalUrl,
    error: error instanceof Error ? error.stack : String(error),
  });
  sendErrorBody(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
};
