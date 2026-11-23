import type { Request, Response } from 'express';
import { asyncHandler, sendData } from '../../lib/http';
import { prisma } from '../../lib/prisma';

export const overviewHandler = asyncHandler(
  async (_req: Request, res: Response) => {
    const [candidates, questions, activeQuestions, attempts, admins] =
      await Promise.all([
        prisma.candidate.count(),
        prisma.question.count(),
        prisma.question.count({ where: { isActive: true } }),
        prisma.testAttempt.count(),
        prisma.admin.count(),
      ]);

    sendData(res, {
      overview: { candidates, questions, activeQuestions, attempts, admins },
    });
  },
);
