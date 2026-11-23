import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { AppError } from '../../lib/errors';
import { toCandidateDto, type CandidateDto } from './candidates.dto';
import type {
  CandidateLoginInput,
  RegisterCandidateInput,
} from './candidates.schemas';

export const EMAIL_TAKEN_MESSAGE = 'This email is already registered.';

const DUMMY_HASH = bcrypt.hashSync('invalid-password-placeholder', env.BCRYPT_ROUNDS);

function emailTaken(): AppError {
  return AppError.conflict(EMAIL_TAKEN_MESSAGE, 'EMAIL_TAKEN', {
    email: EMAIL_TAKEN_MESSAGE,
  });
}

function invalidCredentials(): AppError {
  return AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
}

export async function registerCandidate(
  input: RegisterCandidateInput,
): Promise<CandidateDto> {
  const existing = await prisma.candidate.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existing) {
    throw emailTaken();
  }

  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);

  try {
    const candidate = await prisma.candidate.create({
      data: {
        fullName: input.fullName,
        email: input.email,
        passwordHash,
        age: input.age,
        phone: input.phone,
        gender: input.gender ?? null,
        highestQualification: input.highestQualification,
        city: input.city && input.city.length > 0 ? input.city : null,
      },
    });
    return toCandidateDto(candidate);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw emailTaken();
    }
    throw error;
  }
}

export async function loginCandidate(
  input: CandidateLoginInput,
): Promise<CandidateDto> {
  const candidate = await prisma.candidate.findUnique({
    where: { email: input.email },
  });
  const passwordHash = candidate ? candidate.passwordHash : DUMMY_HASH;
  const passwordMatches = await bcrypt.compare(input.password, passwordHash);

  if (!candidate || !passwordMatches) {
    throw invalidCredentials();
  }

  return toCandidateDto(candidate);
}

export async function getCandidateById(id: string): Promise<CandidateDto> {
  const candidate = await prisma.candidate.findUnique({ where: { id } });
  if (!candidate) {
    throw AppError.unauthorized(
      'Authentication required or session expired',
      'AUTH_INVALID',
    );
  }
  return toCandidateDto(candidate);
}
