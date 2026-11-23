import type { Request, Response } from 'express';
import { asyncHandler, sendCreated, sendData } from '../../lib/http';
import { getCandidate } from '../../middleware/auth';
import {
  getAttemptState,
  getInstructions,
  getQuestionView,
  getResult,
  getResultReview,
  saveAnswer,
  startOrResume,
  submitAttempt,
} from './assessment.service';
import type { SaveAnswerInput } from './assessment.schemas';

function questionIndex(req: Request): number {
  const params = req.params as { index: number | string };
  return Number(params.index);
}

export const instructionsHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const candidate = getCandidate(req);
    const instructions = await getInstructions(candidate.id);
    sendData(res, { instructions });
  },
);

export const startHandler = asyncHandler(async (req: Request, res: Response) => {
  const candidate = getCandidate(req);
  const { state, created } = await startOrResume(candidate.id);
  if (created) {
    sendCreated(res, { attempt: state });
  } else {
    sendData(res, { attempt: state });
  }
});

export const attemptStateHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const candidate = getCandidate(req);
    const attempt = await getAttemptState(candidate.id);
    sendData(res, { attempt });
  },
);

export const questionHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const candidate = getCandidate(req);
    const question = await getQuestionView(candidate.id, questionIndex(req));
    sendData(res, { question });
  },
);

export const saveAnswerHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const candidate = getCandidate(req);
    const input = req.body as SaveAnswerInput;
    const answer = await saveAnswer(candidate.id, questionIndex(req), input);
    sendData(res, { answer });
  },
);

export const submitHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const candidate = getCandidate(req);
    const result = await submitAttempt(candidate.id);
    sendData(res, { result });
  },
);

export const resultHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const candidate = getCandidate(req);
    const result = await getResult(candidate.id);
    sendData(res, { result: { ...result, candidateName: candidate.fullName } });
  },
);

export const reviewHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const candidate = getCandidate(req);
    const review = await getResultReview(candidate.id);
    sendData(res, { review: { ...review, candidateName: candidate.fullName } });
  },
);
