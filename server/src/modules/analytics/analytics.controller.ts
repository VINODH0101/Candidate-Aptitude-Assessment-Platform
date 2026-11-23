import type { Request, Response } from 'express';
import { asyncHandler, sendData } from '../../lib/http';
import { getDashboardAnalytics } from './analytics.service';

export const analyticsHandler = asyncHandler(
  async (_req: Request, res: Response) => {
    const analytics = await getDashboardAnalytics();
    sendData(res, { analytics });
  },
);
