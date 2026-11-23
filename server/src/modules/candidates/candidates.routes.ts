import { Router } from 'express';
import { asyncHandler } from '../../lib/http';
import { validate } from '../../middleware/validate';
import { requireCandidate } from '../../middleware/auth';
import { authRateLimiter } from '../../middleware/rateLimit';
import {
  candidateLoginHandler,
  candidateLogoutHandler,
  candidateSessionHandler,
  registerCandidateHandler,
} from './candidates.controller';
import {
  candidateLoginSchema,
  registerCandidateSchema,
} from './candidates.schemas';

export const candidateAuthRouter = Router();

candidateAuthRouter.post(
  '/register',
  authRateLimiter,
  validate({ body: registerCandidateSchema }),
  asyncHandler(registerCandidateHandler),
);

candidateAuthRouter.post(
  '/login',
  authRateLimiter,
  validate({ body: candidateLoginSchema }),
  asyncHandler(candidateLoginHandler),
);

candidateAuthRouter.post('/logout', asyncHandler(candidateLogoutHandler));

candidateAuthRouter.get('/session', requireCandidate, asyncHandler(candidateSessionHandler));
