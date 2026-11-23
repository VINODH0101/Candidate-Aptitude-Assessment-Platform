import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';

export interface ValidationSchemas {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
}

export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req, _res, next) => {
    try {
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as typeof req.params;
      }
      if (schemas.query) {
        req.query = schemas.query.parse(req.query) as unknown as typeof req.query;
      }
      if (schemas.body) {
        req.body = schemas.body.parse(req.body) as unknown;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
