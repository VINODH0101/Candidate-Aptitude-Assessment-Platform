import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { resetDatabase } from './helpers/db';
import { createAdmin, loginAdmin } from './helpers/factories';
import { createActiveQuestions, createCandidate } from './helpers/domain';

let app: Express;

beforeEach(async () => {
  await resetDatabase();
  app = createApp();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('assessment start readiness', () => {
  it('blocks assessment start with fewer than 10 active questions', async () => {
    await createAdmin();
    const admin = await loginAdmin(app);
    await createActiveQuestions(admin, 9);
    const candidate = await createCandidate();

    const response = await admin
      .post('/api/admin/attempts/start')
      .send({ candidateId: candidate.id });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ASSESSMENT_NOT_READY');
    expect(response.body.error.details).toMatchObject({
      activeQuestions: 9,
      required: 10,
    });
    expect(await prisma.testAttempt.count()).toBe(0);
  });

  it('reports readiness via the readiness endpoint', async () => {
    await createAdmin();
    const admin = await loginAdmin(app);

    const notReady = await admin.get('/api/admin/assessment/readiness');
    expect(notReady.status).toBe(200);
    expect(notReady.body.data.readiness).toMatchObject({
      ready: false,
      activeQuestions: 0,
      required: 10,
    });

    await createActiveQuestions(admin, 10);
    const ready = await admin.get('/api/admin/assessment/readiness');
    expect(ready.body.data.readiness).toMatchObject({
      ready: true,
      activeQuestions: 10,
      required: 10,
    });
  });

  it('starts an assessment with 10 active questions and snapshots them', async () => {
    await createAdmin();
    const admin = await loginAdmin(app);
    const questions = await createActiveQuestions(admin, 10);
    const candidate = await createCandidate();

    const response = await admin
      .post('/api/admin/attempts/start')
      .send({ candidateId: candidate.id });

    expect(response.status).toBe(201);
    expect(response.body.data.attempt).toMatchObject({
      candidateId: candidate.id,
      status: 'IN_PROGRESS',
      durationMinutes: 15,
      passPercentage: 60,
      questionCount: 10,
    });

    const stored = await prisma.testAttempt.findUnique({
      where: { candidateId: candidate.id },
    });
    expect(stored?.questionOrder).toHaveLength(10);
    const snapshots = stored?.questionSnapshots as Array<{
      questionId: string;
      questionText: string;
      options: string[];
      correctOptionIndex: number;
    }>;
    expect(snapshots).toHaveLength(10);
    expect(snapshots[0]?.options).toHaveLength(4);
    expect(typeof snapshots[0]?.correctOptionIndex).toBe('number');
    expect(questions.some((question) => question.id === snapshots[0]?.questionId)).toBe(
      true,
    );
  });

  it('prevents a second attempt for the same candidate', async () => {
    await createAdmin();
    const admin = await loginAdmin(app);
    await createActiveQuestions(admin, 10);
    const candidate = await createCandidate();

    const first = await admin
      .post('/api/admin/attempts/start')
      .send({ candidateId: candidate.id });
    expect(first.status).toBe(201);

    const second = await admin
      .post('/api/admin/attempts/start')
      .send({ candidateId: candidate.id });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('ATTEMPT_EXISTS');
    expect(second.body.error.details.attemptId).toBe(first.body.data.attempt.id);

    expect(
      await prisma.testAttempt.count({ where: { candidateId: candidate.id } }),
    ).toBe(1);
  });

  it('returns 404 for an unknown candidate', async () => {
    await createAdmin();
    const admin = await loginAdmin(app);
    await createActiveQuestions(admin, 10);

    const response = await admin
      .post('/api/admin/attempts/start')
      .send({ candidateId: randomUUID() });
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('CANDIDATE_NOT_FOUND');
  });

  it('preserves historical snapshots when questions are edited later', async () => {
    await createAdmin();
    const admin = await loginAdmin(app);
    const questions = await createActiveQuestions(admin, 10);
    const candidate = await createCandidate();

    const started = await admin
      .post('/api/admin/attempts/start')
      .send({ candidateId: candidate.id });
    expect(started.status).toBe(201);

    const before = await prisma.testAttempt.findUnique({
      where: { candidateId: candidate.id },
    });
    const target = questions[0];
    if (!target) throw new Error('missing question');

    const edited = await admin.put(`/api/admin/questions/${target.id}`).send({
      questionText: 'A completely rewritten question after the attempt started?',
      options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
      correctOptionIndex: 3,
      category: 'LOGICAL',
      difficulty: 'HARD',
    });
    expect(edited.status).toBe(200);

    const after = await prisma.testAttempt.findUnique({
      where: { candidateId: candidate.id },
    });
    expect(JSON.stringify(after?.questionSnapshots)).toBe(
      JSON.stringify(before?.questionSnapshots),
    );

    const live = await prisma.question.findUnique({ where: { id: target.id } });
    expect(live?.questionText).toBe(
      'A completely rewritten question after the attempt started?',
    );
    expect(live?.correctOptionIndex).toBe(3);

    const blockedDelete = await admin.delete(`/api/admin/questions/${target.id}`);
    expect(blockedDelete.status).toBe(409);
    expect(blockedDelete.body.error.code).toBe('QUESTION_IN_USE');
  });

  it('requires an admin session to start an assessment', async () => {
    const response = await request(app)
      .post('/api/admin/attempts/start')
      .send({ candidateId: randomUUID() });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_REQUIRED');
  });
});
