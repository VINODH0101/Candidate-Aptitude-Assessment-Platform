import type { Request, Response } from 'express';
import { asyncHandler, sendCreated } from '../../lib/http';
import { startTestAttempt } from './attempts.service';
import type { StartAttemptInput } from './attempts.schemas';

export const startAttemptHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const { candidateId } = req.body as StartAttemptInput;
    const attempt = await startTestAttempt(candidateId);
    sendCreated(res, { attempt });
  },
);
