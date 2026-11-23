import { Router } from 'express';
import { asyncHandler } from '../../lib/http';
import { validate } from '../../middleware/validate';
import { requireAdmin } from '../../middleware/auth';
import { authRateLimiter } from '../../middleware/rateLimit';
import {
  adminLoginHandler,
  adminLogoutHandler,
  adminSessionHandler,
} from './admin-auth.controller';
import { adminLoginSchema } from './admin-auth.schemas';

export const adminAuthRouter = Router();

adminAuthRouter.post(
  '/login',
  authRateLimiter,
  validate({ body: adminLoginSchema }),
  asyncHandler(adminLoginHandler),
);

adminAuthRouter.post('/logout', asyncHandler(adminLogoutHandler));

adminAuthRouter.get('/session', requireAdmin, asyncHandler(adminSessionHandler));
