import type { CookieOptions, Response } from 'express';
import { cookieSecure } from '../config/env';

export const ADMIN_COOKIE = 'admin_token';
export const CANDIDATE_COOKIE = 'candidate_token';

function baseOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: 'lax',
    path: '/',
  };
}

function setSessionCookie(
  res: Response,
  name: string,
  token: string,
  maxAgeMs: number,
): void {
  res.cookie(name, token, { ...baseOptions(), maxAge: maxAgeMs });
}

function clearSessionCookie(res: Response, name: string): void {
  res.clearCookie(name, baseOptions());
}

export function setAdminCookie(res: Response, token: string, maxAgeMs: number): void {
  setSessionCookie(res, ADMIN_COOKIE, token, maxAgeMs);
}

export function clearAdminCookie(res: Response): void {
  clearSessionCookie(res, ADMIN_COOKIE);
}

export function setCandidateCookie(
  res: Response,
  token: string,
  maxAgeMs: number,
): void {
  setSessionCookie(res, CANDIDATE_COOKIE, token, maxAgeMs);
}

export function clearCandidateCookie(res: Response): void {
  clearSessionCookie(res, CANDIDATE_COOKIE);
}
