import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { resetDatabase } from './helpers/db';
import { createAdmin, loginAdmin, newAgent } from './helpers/factories';
import { createActiveQuestions } from './helpers/domain';
import { buildResultsCsv, escapeCsvCell } from '../src/modules/results/csv';

let app: Express;

beforeEach(async () => {
  await resetDatabase();
  app = createApp();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function secret(): string {
  const value = process.env.JWT_ACCESS_SECRET;
  if (!value) throw new Error('JWT_ACCESS_SECRET is missing in tests');
  return value;
}

const candidatePayload = (email: string) => ({
  fullName: 'Audit Candidate',
  email,
  password: 'StrongPass123!',
  age: 27,
  phone: '9876543210',
  gender: 'FEMALE',
  highestQualification: 'BACHELORS',
  city: 'Pune',
});

describe('CSRF origin enforcement', () => {
  it('rejects state-changing requests from a disallowed origin', async () => {
    await createAdmin();
    const response = await request(app)
      .post('/api/admin/auth/login')
      .set('Origin', 'http://evil.example.com')
      .send({ email: 'admin@example.com', password: 'AdminPass123!' });
    expect(response.status).toBe(403);
    expect(['CSRF_ORIGIN', 'CORS_FORBIDDEN']).toContain(response.body.error.code);
  });

  it('allows state-changing requests from a configured origin', async () => {
    await createAdmin();
    const response = await request(app)
      .post('/api/admin/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send({ email: 'admin@example.com', password: 'AdminPass123!' });
    expect(response.status).toBe(200);
  });
});

describe('token security', () => {
  it('rejects tokens signed with a different secret', async () => {
    const admin = await createAdmin();
    const forged = jwt.sign({ kind: 'admin' }, 'attacker-controlled-secret-0123456789abcdef', {
      subject: admin.id,
      expiresIn: 3600,
      algorithm: 'HS256',
    });
    const response = await request(app)
      .get('/api/admin/overview')
      .set('Cookie', `admin_token=${forged}`);
    expect(response.status).toBe(401);
  });

  it('rejects unsigned (alg=none) tokens', async () => {
    const admin = await createAdmin();
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
      'base64url',
    );
    const payload = Buffer.from(
      JSON.stringify({
        kind: 'admin',
        sub: admin.id,
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString('base64url');
    const token = `${header}.${payload}.`;
    const response = await request(app)
      .get('/api/admin/overview')
      .set('Cookie', `admin_token=${token}`);
    expect(response.status).toBe(401);
  });

  it('rejects a token whose subject is not an admin even with a valid signature', async () => {
    const candidate = await prisma.candidate.create({
      data: {
        fullName: 'Imposter Candidate',
        email: 'imposter@example.com',
        passwordHash: 'x',
        age: 25,
        phone: '9876543210',
        highestQualification: 'BACHELORS',
      },
    });
    const token = jwt.sign({ kind: 'admin' }, secret(), {
      subject: candidate.id,
      expiresIn: 3600,
      algorithm: 'HS256',
    });
    const response = await request(app)
      .get('/api/admin/overview')
      .set('Cookie', `admin_token=${token}`);
    expect(response.status).toBe(401);
  });
});

describe('mass assignment and input validation', () => {
  it('rejects unknown fields on answer saves (strict schema)', async () => {
    await createActiveQuestions(await setupAdmin(), 10);
    const agent = newAgent(app);
    await agent.post('/api/candidate/register').send(candidatePayload('strict@example.com'));
    await agent.post('/api/candidate/assessment/start');

    const response = await agent
      .put('/api/candidate/assessment/attempt/answers/0')
      .send({ selectedOptionIndex: 1, netScore: 20, role: 'ADMIN' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('ignores client-supplied scoring data on submit', async () => {
    await createActiveQuestions(await setupAdmin(), 10);
    const agent = newAgent(app);
    await agent.post('/api/candidate/register').send(candidatePayload('submit@example.com'));
    await agent.post('/api/candidate/assessment/start');

    const response = await agent
      .post('/api/candidate/assessment/submit')
      .send({ netScore: 20, percentage: 100, passed: true });
    expect(response.status).toBe(200);
    expect(response.body.data.result.netScore).toBe(0);
    expect(response.body.data.result.percentage).toBe(0);
  });

  it('treats SQL metacharacters in search as literal text', async () => {
    const admin = await setupAdmin();
    const response = await admin.get(
      `/api/admin/results?search=${encodeURIComponent("' OR 1=1 --")}`,
    );
    expect(response.status).toBe(200);
    expect(response.body.data.results.filteredCount).toBe(0);
  });

  it('rejects malformed ids and out-of-range pagination', async () => {
    const admin = await setupAdmin();
    const badId = await admin.get('/api/admin/questions/not-a-uuid');
    expect(badId.status).toBe(400);
    const badPage = await admin.get('/api/admin/results?pageSize=1000');
    expect(badPage.status).toBe(400);
  });
});

describe('concurrency', () => {
  it('serializes concurrent attempt starts into a single attempt', async () => {
    await createActiveQuestions(await setupAdmin(), 10);
    const agent = newAgent(app);
    const registered = await agent
      .post('/api/candidate/register')
      .send(candidatePayload('race.start@example.com'));
    const candidateId = registered.body.data.candidate.id as string;

    const responses = await Promise.all([
      agent.post('/api/candidate/assessment/start'),
      agent.post('/api/candidate/assessment/start'),
    ]);
    expect(responses.every((response) => [200, 201].includes(response.status))).toBe(
      true,
    );
    const ids = new Set(
      responses.map((response) => response.body.data.attempt.id as string),
    );
    expect(ids.size).toBe(1);
    expect(
      await prisma.testAttempt.count({ where: { candidateId } }),
    ).toBe(1);
  });

  it('prevents activating more than the maximum under concurrency', async () => {
    const admin = await setupAdmin();
    await createActiveQuestions(admin, 9);
    const first = await createInactiveQuestion(admin, 'concurrent-a');
    const second = await createInactiveQuestion(admin, 'concurrent-b');

    const responses = await Promise.all([
      admin.patch(`/api/admin/questions/${first}/status`).send({ isActive: true }),
      admin.patch(`/api/admin/questions/${second}/status`).send({ isActive: true }),
    ]);
    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([200, 409]);
    expect(await prisma.question.count({ where: { isActive: true } })).toBe(10);
  });
});

describe('pass / fail boundary', () => {
  it('passes exactly at the threshold and fails one mark below', async () => {
    await createActiveQuestions(await setupAdmin(), 10);
    const boundary = newAgent(app);
    await boundary
      .post('/api/candidate/register')
      .send(candidatePayload('boundary@example.com'));
    await boundary.post('/api/candidate/assessment/start');

    const below = newAgent(app);
    await below
      .post('/api/candidate/register')
      .send(candidatePayload('below@example.com'));
    await below.post('/api/candidate/assessment/start');

    const boundaryCandidate = await prisma.candidate.findUnique({
      where: { email: 'boundary@example.com' },
    });
    if (!boundaryCandidate) throw new Error('boundary candidate missing');
    const attempt = await prisma.testAttempt.findUnique({
      where: { candidateId: boundaryCandidate.id },
    });
    const snapshots = attempt?.questionSnapshots as Array<{
      correctOptionIndex: number;
    }>;

    // 6 correct, 0 incorrect, 4 unanswered => 12/20 = 60% (pass at 60).
    for (let position = 0; position < 6; position += 1) {
      const snapshot = snapshots[position];
      if (!snapshot) continue;
      await boundary
        .put(`/api/candidate/assessment/attempt/answers/${position}`)
        .send({ selectedOptionIndex: snapshot.correctOptionIndex });
    }
    const passResult = await boundary.post('/api/candidate/assessment/submit');
    expect(passResult.body.data.result).toMatchObject({
      netScore: 12,
      percentage: 60,
      passed: true,
    });

    // 5 correct, 1 incorrect, 4 unanswered => 9/20 = 45% (fail).
    const belowCandidate = await prisma.candidate.findUnique({
      where: { email: 'below@example.com' },
    });
    if (!belowCandidate) throw new Error('below candidate missing');
    const belowAttempt = await prisma.testAttempt.findUnique({
      where: { candidateId: belowCandidate.id },
    });
    const belowSnapshots = belowAttempt?.questionSnapshots as Array<{
      correctOptionIndex: number;
    }>;
    for (let position = 0; position < 5; position += 1) {
      const snapshot = belowSnapshots[position];
      if (!snapshot) continue;
      await below
        .put(`/api/candidate/assessment/attempt/answers/${position}`)
        .send({ selectedOptionIndex: snapshot.correctOptionIndex });
    }
    const incorrect = belowSnapshots[5];
    if (incorrect) {
      await below
        .put('/api/candidate/assessment/attempt/answers/5')
        .send({ selectedOptionIndex: (incorrect.correctOptionIndex + 1) % 4 });
    }
    const failResult = await below.post('/api/candidate/assessment/submit');
    expect(failResult.body.data.result).toMatchObject({
      netScore: 9,
      percentage: 45,
      passed: false,
    });
  });
});

describe('CSV formula injection hardening', () => {
  it('neutralizes formulas hidden behind leading whitespace', () => {
    expect(escapeCsvCell('  =1+1')).toBe("'  =1+1");
    expect(escapeCsvCell(' \t@cmd')).toBe("' \t@cmd");
  });

  it('still keeps plain text and numbers intact', () => {
    expect(escapeCsvCell('Jane Doe')).toBe('Jane Doe');
    expect(escapeCsvCell(-10)).toBe('-10');
    expect(
      buildResultsCsv([]).startsWith('Candidate Name,Email,Phone'),
    ).toBe(true);
  });
});

async function setupAdmin() {
  await createAdmin();
  return loginAdmin(app);
}

async function createInactiveQuestion(
  admin: Awaited<ReturnType<typeof setupAdmin>>,
  marker: string,
): Promise<string> {
  const response = await admin.post('/api/admin/questions').send({
    questionText: `Audit concurrency question ${marker}?`,
    options: ['A', 'B', 'C', 'D'],
    correctOptionIndex: 0,
    category: 'QUANTITATIVE',
    difficulty: 'EASY',
  });
  if (response.status !== 201) {
    throw new Error(`failed to create question: ${JSON.stringify(response.body)}`);
  }
  return response.body.data.question.id as string;
}
