import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

export const TEST_DATABASE_NAME = process.env.TEST_DATABASE_NAME ?? 'aptitude_test';

const sourceUrl =
  process.env.DATABASE_URL ??
  'postgresql://aptitude:aptitude@localhost:5432/aptitude?schema=public';

function withDatabase(database: string): string {
  const url = new URL(sourceUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

export function buildTestDatabaseUrl(): string {
  return withDatabase(TEST_DATABASE_NAME);
}

export function buildAdminDatabaseUrl(): string {
  return withDatabase('postgres');
}
