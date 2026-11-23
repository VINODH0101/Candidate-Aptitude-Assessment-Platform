import { Router } from 'express';
import { asyncHandler } from '../../lib/http';
import { analyticsHandler } from './analytics.controller';

export const analyticsRouter = Router();

analyticsRouter.get('/', asyncHandler(analyticsHandler));
