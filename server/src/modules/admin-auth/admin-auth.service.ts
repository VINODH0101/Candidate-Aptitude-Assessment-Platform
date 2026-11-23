import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { AppError } from '../../lib/errors';
import { signAdminToken } from '../../lib/tokens';
import { toAdminDto, type AdminDto } from './admin-auth.dto';
import type { AdminLoginInput } from './admin-auth.schemas';

// Used to keep timing similar when the email does not exist (prevents user enumeration).
const DUMMY_HASH = bcrypt.hashSync('invalid-password-placeholder', env.BCRYPT_ROUNDS);

export interface AdminSessionResult {
  admin: AdminDto;
  token: string;
  expiresAt: Date;
}

export async function loginAdmin(
  input: AdminLoginInput,
): Promise<AdminSessionResult> {
  const admin = await prisma.admin.findUnique({ where: { email: input.email } });
  const passwordHash = admin ? admin.passwordHash : DUMMY_HASH;
  const passwordMatches = await bcrypt.compare(input.password, passwordHash);

  if (!admin || !passwordMatches) {
    throw AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  const { token, expiresAt } = signAdminToken(admin.id);
  return { admin: toAdminDto(admin), token, expiresAt };
}

export async function getAdminById(adminId: string): Promise<AdminDto> {
  const admin = await prisma.admin.findUnique({
    where: { id: adminId },
    select: { id: true, email: true, name: true, createdAt: true },
  });
  if (!admin) {
    throw AppError.unauthorized(
      'Authentication required or session expired',
      'AUTH_INVALID',
    );
  }
  return toAdminDto(admin);
}
