import { Router } from 'express';
import { asyncHandler } from '../../lib/http';
import { validate } from '../../middleware/validate';
import {
  attemptStateHandler,
  instructionsHandler,
  questionHandler,
  resultHandler,
  reviewHandler,
  saveAnswerHandler,
  startHandler,
  submitHandler,
} from './assessment.controller';
import {
  questionIndexParamSchema,
  saveAnswerSchema,
} from './assessment.schemas';

export const assessmentRouter = Router();

assessmentRouter.get('/instructions', asyncHandler(instructionsHandler));

assessmentRouter.post('/start', asyncHandler(startHandler));

assessmentRouter.get('/attempt', asyncHandler(attemptStateHandler));

assessmentRouter.get(
  '/attempt/questions/:index',
  validate({ params: questionIndexParamSchema }),
  asyncHandler(questionHandler),
);

assessmentRouter.put(
  '/attempt/answers/:index',
  validate({ params: questionIndexParamSchema, body: saveAnswerSchema }),
  asyncHandler(saveAnswerHandler),
);

assessmentRouter.post('/submit', asyncHandler(submitHandler));

assessmentRouter.get('/result/review', asyncHandler(reviewHandler));

assessmentRouter.get('/result', asyncHandler(resultHandler));
