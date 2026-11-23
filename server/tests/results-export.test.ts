import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { resetDatabase } from './helpers/db';
import { createAdmin, loginAdmin, newAgent } from './helpers/factories';
import {
  createFinalizedAttempt,
  createInProgressAttempt,
} from './helpers/domain';
import { CSV_HEADERS } from '../src/modules/results/csv';

let app: Express;

beforeEach(async () => {
  await resetDatabase();
  app = createApp();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function setupAdmin() {
  await createAdmin();
  return loginAdmin(app);
}

function csvLines(csv: string): string[] {
  return csv.split(/\r\n/).filter((line) => line.length > 0);
}

async function seedTwelve(): Promise<void> {
  const base = Date.now();
  for (let index = 1; index <= 12; index += 1) {
    const correct = index <= 6 ? 7 : 2;
    const incorrect = index % 3;
    const unattempted = 10 - correct - incorrect;
    await createFinalizedAttempt({
      fullName: `Candidate ${String.fromCharCode(64 + index)}`,
      email: `export${index}@example.com`,
      correct,
      incorrect,
      unattempted,
      status: index === 12 ? 'EXPIRED' : 'COMPLETED',
      startedAt: new Date(base - index * 3_600_000),
    });
  }
}

describe('CSV export', () => {
  it('exports all finalized rows with headers, ignoring pagination and in-progress attempts', async () => {
    const admin = await setupAdmin();
    await seedTwelve();
    await createInProgressAttempt({
      fullName: 'Still Working',
      email: 'inprogress.export@example.com',
    });

    const response = await admin.get('/api/admin/results/export');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toContain('attachment');
    expect(response.headers['content-disposition']).toContain('.csv');

    const csv = response.text;
    const lines = csvLines(csv);
    expect(lines).toHaveLength(13);
    expect(lines[0]).toBe(CSV_HEADERS.join(','));
    expect(csv).not.toContain('Still Working');
    expect(csv).toContain('Candidate A');
    expect(csv).toContain('export1@example.com');
    expect(csv).toContain('9876543210');
    expect(csv).toContain('Time Taken (seconds)');
  });

  it('respects search, pass/fail filters and sorting', async () => {
    const admin = await setupAdmin();
    await createFinalizedAttempt({
      fullName: 'Alpha One',
      email: 'alpha@example.com',
      correct: 10,
      incorrect: 0,
      unattempted: 0,
    });
    await createFinalizedAttempt({
      fullName: 'Bravo Two',
      email: 'bravo@example.com',
      correct: 0,
      incorrect: 10,
      unattempted: 0,
    });
    await createFinalizedAttempt({
      fullName: 'Charlie Three',
      email: 'charlie@example.com',
      correct: 6,
      incorrect: 0,
      unattempted: 4,
    });

    const search = await admin.get(
      '/api/admin/results/export?search=Bravo',
    );
    const searchLines = csvLines(search.text);
    expect(searchLines).toHaveLength(2);
    expect(searchLines[1]).toContain('Bravo Two');

    const failed = await admin.get('/api/admin/results/export?result=FAIL');
    const failedLines = csvLines(failed.text);
    expect(failedLines).toHaveLength(2);
    expect(failedLines[1]).toContain('Bravo Two');

    const ascending = await admin.get(
      '/api/admin/results/export?sortBy=score&sortOrder=asc',
    );
    const ascendingLines = csvLines(ascending.text);
    expect(ascendingLines[1]).toContain('Bravo Two');

    const descending = await admin.get(
      '/api/admin/results/export?sortBy=score&sortOrder=desc',
    );
    const descendingLines = csvLines(descending.text);
    expect(descendingLines[1]).toContain('Alpha One');
  });

  it('escapes commas and prevents CSV formula injection', async () => {
    const admin = await setupAdmin();
    await createFinalizedAttempt({
      fullName: 'Injection User',
      email: '=cmd@example.com',
      correct: 5,
      incorrect: 0,
      unattempted: 5,
    });
    await createFinalizedAttempt({
      fullName: 'Comma User',
      email: 'a,b@example.com',
      correct: 5,
      incorrect: 0,
      unattempted: 5,
    });

    const response = await admin.get('/api/admin/results/export');
    expect(response.status).toBe(200);
    expect(response.text).toContain("'=cmd@example.com");
    expect(response.text).toContain('"a,b@example.com"');
  });

  it('returns headers only for an empty dataset', async () => {
    const admin = await setupAdmin();
    const response = await admin.get('/api/admin/results/export');
    expect(response.status).toBe(200);
    expect(response.text).toBe(`${CSV_HEADERS.join(',')}\r\n`);
  });

  it('requires an authenticated admin', async () => {
    const anonymous = await request(app).get('/api/admin/results/export');
    expect(anonymous.status).toBe(401);

    const candidate = newAgent(app);
    const registered = await candidate.post('/api/candidate/register').send({
      fullName: 'No Export',
      email: 'noexport@example.com',
      password: 'StrongPass123!',
      age: 25,
      phone: '9876543210',
      highestQualification: 'BACHELORS',
    });
    expect(registered.status).toBe(201);

    const forbidden = await candidate.get('/api/admin/results/export');
    expect(forbidden.status).toBe(401);
  });
});
