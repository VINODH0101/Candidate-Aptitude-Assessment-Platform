import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface IssuedToken {
  token: string;
  expiresAt: Date;
}

type TokenKind = 'admin' | 'candidate';

export type TokenVerification =
  | { ok: true; subject: string }
  | { ok: false; reason: 'expired' | 'invalid' };

function sign(kind: TokenKind, subject: string, hours: number): IssuedToken {
  const ttlSeconds = hours * 60 * 60;
  const token = jwt.sign({ kind }, env.JWT_ACCESS_SECRET, {
    subject,
    expiresIn: ttlSeconds,
    algorithm: 'HS256',
  });
  return { token, expiresAt: new Date(Date.now() + ttlSeconds * 1000) };
}

function verify(kind: TokenKind, token: string): TokenVerification {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
    });
    if (typeof decoded === 'string' || typeof decoded.sub !== 'string') {
      return { ok: false, reason: 'invalid' };
    }
    if ((decoded as jwt.JwtPayload).kind !== kind) {
      return { ok: false, reason: 'invalid' };
    }
    return { ok: true, subject: decoded.sub };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return { ok: false, reason: 'expired' };
    }
    return { ok: false, reason: 'invalid' };
  }
}

export function signAdminToken(adminId: string): IssuedToken {
  return sign('admin', adminId, env.ADMIN_SESSION_HOURS);
}

export function signCandidateToken(candidateId: string): IssuedToken {
  return sign('candidate', candidateId, env.CANDIDATE_SESSION_HOURS);
}

export function verifyAdminToken(
  token: string,
): { ok: true; adminId: string } | { ok: false; reason: 'expired' | 'invalid' } {
  const result = verify('admin', token);
  return result.ok ? { ok: true, adminId: result.subject } : result;
}

export function verifyCandidateToken(
  token: string,
):
  | { ok: true; candidateId: string }
  | { ok: false; reason: 'expired' | 'invalid' } {
  const result = verify('candidate', token);
  return result.ok ? { ok: true, candidateId: result.subject } : result;
}
