import { Router } from 'express';
import { asyncHandler } from '../../lib/http';
import { overviewHandler } from './admin.controller';
import { assessmentReadinessHandler } from '../questions/questions.controller';
import { questionsRouter } from '../questions/questions.routes';
import { settingsRouter } from '../settings/settings.routes';
import { attemptsRouter } from '../attempts/attempts.routes';
import { resultsRouter } from '../results/results.routes';
import { analyticsRouter } from '../analytics/analytics.routes';

export const adminRouter = Router();

adminRouter.get('/overview', asyncHandler(overviewHandler));
adminRouter.get('/assessment/readiness', asyncHandler(assessmentReadinessHandler));

adminRouter.use('/questions', questionsRouter);
adminRouter.use('/settings', settingsRouter);
adminRouter.use('/attempts', attemptsRouter);
adminRouter.use('/results', resultsRouter);
adminRouter.use('/analytics', analyticsRouter);
