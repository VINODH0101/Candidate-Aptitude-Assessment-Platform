import { Router } from 'express';
import { asyncHandler } from '../../lib/http';
import { validate } from '../../middleware/validate';
import {
  createQuestionHandler,
  deleteQuestionHandler,
  getQuestionHandler,
  listQuestionsHandler,
  setQuestionStatusHandler,
  updateQuestionHandler,
} from './questions.controller';
import {
  createQuestionSchema,
  listQuestionsQuerySchema,
  questionIdParamSchema,
  questionStatusSchema,
  updateQuestionSchema,
} from './questions.schemas';

export const questionsRouter = Router();

questionsRouter.get(
  '/',
  validate({ query: listQuestionsQuerySchema }),
  asyncHandler(listQuestionsHandler),
);

questionsRouter.post(
  '/',
  validate({ body: createQuestionSchema }),
  asyncHandler(createQuestionHandler),
);

questionsRouter.get(
  '/:id',
  validate({ params: questionIdParamSchema }),
  asyncHandler(getQuestionHandler),
);

questionsRouter.put(
  '/:id',
  validate({ params: questionIdParamSchema, body: updateQuestionSchema }),
  asyncHandler(updateQuestionHandler),
);

questionsRouter.patch(
  '/:id/status',
  validate({ params: questionIdParamSchema, body: questionStatusSchema }),
  asyncHandler(setQuestionStatusHandler),
);

questionsRouter.delete(
  '/:id',
  validate({ params: questionIdParamSchema }),
  asyncHandler(deleteQuestionHandler),
);
