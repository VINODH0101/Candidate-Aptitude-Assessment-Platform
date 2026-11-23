import type { Request, Response } from 'express';
import { asyncHandler, sendCreated, sendData } from '../../lib/http';
import {
  createQuestion,
  deleteQuestion,
  getAssessmentReadiness,
  getQuestion,
  listQuestions,
  setQuestionStatus,
  updateQuestion,
} from './questions.service';
import type {
  CreateQuestionInput,
  ListQuestionsQuery,
  UpdateQuestionInput,
} from './questions.schemas';

export const listQuestionsHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const query = req.query as unknown as ListQuestionsQuery;
    const result = await listQuestions(query);
    sendData(res, result);
  },
);

export const getQuestionHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const question = await getQuestion(id);
    sendData(res, { question });
  },
);

export const createQuestionHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const input = req.body as CreateQuestionInput;
    const question = await createQuestion(input);
    sendCreated(res, { question });
  },
);

export const updateQuestionHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const input = req.body as UpdateQuestionInput;
    const question = await updateQuestion(id, input);
    sendData(res, { question });
  },
);

export const setQuestionStatusHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const { isActive } = req.body as { isActive: boolean };
    const question = await setQuestionStatus(id, isActive);
    sendData(res, { question });
  },
);

export const deleteQuestionHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    await deleteQuestion(id);
    sendData(res, { deleted: true });
  },
);

export const assessmentReadinessHandler = asyncHandler(
  async (_req: Request, res: Response) => {
    const readiness = await getAssessmentReadiness();
    sendData(res, { readiness });
  },
);
