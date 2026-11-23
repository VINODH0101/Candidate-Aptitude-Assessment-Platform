import type { Request, Response } from 'express';
import { asyncHandler, sendData } from '../../lib/http';
import { clearAdminCookie, setAdminCookie } from '../../lib/cookies';
import { getAdmin } from '../../middleware/auth';
import { getAdminById, loginAdmin } from './admin-auth.service';
import type { AdminLoginInput } from './admin-auth.schemas';

export const adminLoginHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const input = req.body as AdminLoginInput;
    const result = await loginAdmin(input);
    const maxAgeMs = Math.max(0, result.expiresAt.getTime() - Date.now());
    setAdminCookie(res, result.token, maxAgeMs);
    sendData(res, { admin: result.admin });
  },
);

export const adminLogoutHandler = asyncHandler(
  async (_req: Request, res: Response) => {
    clearAdminCookie(res);
    sendData(res, { loggedOut: true });
  },
);

export const adminSessionHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const admin = getAdmin(req);
    const fresh = await getAdminById(admin.id);
    sendData(res, { admin: fresh });
  },
);
