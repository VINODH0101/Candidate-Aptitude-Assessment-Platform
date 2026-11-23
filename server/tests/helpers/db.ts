import { prisma } from '../../src/lib/prisma';

const TABLES = [
  'CandidateAnswer',
  'TestAttempt',
  'Question',
  'AppSetting',
  'Candidate',
  'Admin',
];

export async function resetDatabase(): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const table of TABLES) {
      await tx.$executeRawUnsafe(`DELETE FROM "${table}"`);
    }
  });
}
