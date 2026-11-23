import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { ADMIN_COOKIE, CANDIDATE_COOKIE } from '../lib/cookies';
import { verifyAdminToken, verifyCandidateToken } from '../lib/tokens';

export interface AdminAuthUser {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

export interface CandidateAuthUser {
  id: string;
  email: string;
  fullName: string;
}

function readCookie(req: Request, name: string): string | undefined {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function forbiddenByToken(reason: 'expired' | 'invalid'): AppError {
  if (reason === 'expired') {
    return AppError.unauthorized(
      'Your session has expired. Please sign in again.',
      'SESSION_EXPIRED',
    );
  }
  return AppError.unauthorized(
    'Authentication required or session expired',
    'AUTH_INVALID',
  );
}

export async function requireAdmin(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = readCookie(req, ADMIN_COOKIE);
    if (!token) {
      throw AppError.unauthorized(
        'Authentication required or session expired',
        'AUTH_REQUIRED',
      );
    }

    const verification = verifyAdminToken(token);
    if (!verification.ok) throw forbiddenByToken(verification.reason);

    const admin = await prisma.admin.findUnique({
      where: { id: verification.adminId },
      select: { id: true, email: true, name: true, createdAt: true },
    });
    if (!admin) {
      throw AppError.unauthorized(
        'Authentication required or session expired',
        'AUTH_INVALID',
      );
    }

    req.admin = admin;
    next();
  } catch (error) {
    next(error);
  }
}

export async function requireCandidate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = readCookie(req, CANDIDATE_COOKIE);
    if (!token) {
      throw AppError.unauthorized(
        'Authentication required or session expired',
        'AUTH_REQUIRED',
      );
    }

    const verification = verifyCandidateToken(token);
    if (!verification.ok) throw forbiddenByToken(verification.reason);

    const candidate = await prisma.candidate.findUnique({
      where: { id: verification.candidateId },
      select: { id: true, email: true, fullName: true },
    });
    if (!candidate) {
      throw AppError.unauthorized(
        'Authentication required or session expired',
        'AUTH_INVALID',
      );
    }

    req.candidate = candidate;
    next();
  } catch (error) {
    next(error);
  }
}

export function getAdmin(req: Request): AdminAuthUser {
  if (!req.admin) {
    throw AppError.unauthorized(
      'Authentication required or session expired',
      'AUTH_REQUIRED',
    );
  }
  return req.admin;
}

export function getCandidate(req: Request): CandidateAuthUser {
  if (!req.candidate) {
    throw AppError.unauthorized(
      'Authentication required or session expired',
      'AUTH_REQUIRED',
    );
  }
  return req.candidate;
}
