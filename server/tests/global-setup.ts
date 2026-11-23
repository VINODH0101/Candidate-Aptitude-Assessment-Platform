import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import {
  TEST_DATABASE_NAME,
  buildAdminDatabaseUrl,
  buildTestDatabaseUrl,
} from './test-db';

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

async function recreateDatabase(): Promise<void> {
  const admin = new Client({ connectionString: buildAdminDatabaseUrl() });
  await admin.connect();
  try {
    await admin.query(
      `DROP DATABASE IF EXISTS ${quoteIdentifier(TEST_DATABASE_NAME)} WITH (FORCE)`,
    );
    await admin.query(`CREATE DATABASE ${quoteIdentifier(TEST_DATABASE_NAME)}`);
  } finally {
    await admin.end();
  }
}

function migrationFiles(): string[] {
  const migrationsDir = path.resolve(process.cwd(), 'prisma/migrations');
  return fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => path.join(migrationsDir, name, 'migration.sql'))
    .filter((file) => fs.existsSync(file));
}

async function applyMigrations(): Promise<void> {
  const client = new Client({ connectionString: buildTestDatabaseUrl() });
  await client.connect();
  try {
    for (const file of migrationFiles()) {
      const sql = fs.readFileSync(file, 'utf8');
      await client.query(sql);
    }
  } finally {
    await client.end();
  }
}

export default async function globalSetup(): Promise<void> {
  await recreateDatabase();
  await applyMigrations();
}
