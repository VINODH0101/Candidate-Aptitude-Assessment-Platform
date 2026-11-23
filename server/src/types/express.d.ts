import type { AdminAuthUser, CandidateAuthUser } from '../middleware/auth';

declare global {
  namespace Express {
    interface Request {
      admin?: AdminAuthUser;
      candidate?: CandidateAuthUser;
    }
  }
}

export {};
