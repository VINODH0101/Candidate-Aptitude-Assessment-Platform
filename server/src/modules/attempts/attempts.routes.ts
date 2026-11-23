import { Router } from 'express';
import { asyncHandler } from '../../lib/http';
import { validate } from '../../middleware/validate';
import { startAttemptHandler } from './attempts.controller';
import { startAttemptSchema } from './attempts.schemas';

export const attemptsRouter = Router();

attemptsRouter.post(
  '/start',
  validate({ body: startAttemptSchema }),
  asyncHandler(startAttemptHandler),
);
