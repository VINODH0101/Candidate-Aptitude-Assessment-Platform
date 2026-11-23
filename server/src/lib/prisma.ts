import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const logLevels =
  env.NODE_ENV === 'development'
    ? (['warn', 'error'] as const)
    : env.NODE_ENV === 'test'
      ? []
      : (['error'] as const);

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ log: [...logLevels] });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
