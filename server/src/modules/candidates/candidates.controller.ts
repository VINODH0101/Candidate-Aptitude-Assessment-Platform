import type { Request, Response } from 'express';
import { asyncHandler, sendCreated, sendData } from '../../lib/http';
import { clearCandidateCookie, setCandidateCookie } from '../../lib/cookies';
import { signCandidateToken } from '../../lib/tokens';
import { getCandidate } from '../../middleware/auth';
import {
  getCandidateById,
  loginCandidate,
  registerCandidate,
} from './candidates.service';
import type {
  CandidateLoginInput,
  RegisterCandidateInput,
} from './candidates.schemas';

export const registerCandidateHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const input = req.body as RegisterCandidateInput;
    const candidate = await registerCandidate(input);
    const { token, expiresAt } = signCandidateToken(candidate.id);
    setCandidateCookie(res, token, Math.max(0, expiresAt.getTime() - Date.now()));
    sendCreated(res, { candidate });
  },
);

export const candidateLoginHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const input = req.body as CandidateLoginInput;
    const candidate = await loginCandidate(input);
    const { token, expiresAt } = signCandidateToken(candidate.id);
    setCandidateCookie(res, token, Math.max(0, expiresAt.getTime() - Date.now()));
    sendData(res, { candidate });
  },
);

export const candidateLogoutHandler = asyncHandler(
  async (_req: Request, res: Response) => {
    clearCandidateCookie(res);
    sendData(res, { loggedOut: true });
  },
);

export const candidateSessionHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const candidate = getCandidate(req);
    const fresh = await getCandidateById(candidate.id);
    sendData(res, { candidate: fresh });
  },
);
