import { Router } from 'express';
import { asyncHandler } from '../../lib/http';
import { validate } from '../../middleware/validate';
import {
  exportResultsHandler,
  listResultsHandler,
  resultDetailHandler,
} from './results.controller';
import {
  exportResultsQuerySchema,
  listResultsQuerySchema,
  resultAttemptParamSchema,
} from './results.schemas';

export const resultsRouter = Router();

resultsRouter.get(
  '/',
  validate({ query: listResultsQuerySchema }),
  asyncHandler(listResultsHandler),
);

resultsRouter.get(
  '/export',
  validate({ query: exportResultsQuerySchema }),
  asyncHandler(exportResultsHandler),
);

resultsRouter.get(
  '/:attemptId',
  validate({ params: resultAttemptParamSchema }),
  asyncHandler(resultDetailHandler),
);
