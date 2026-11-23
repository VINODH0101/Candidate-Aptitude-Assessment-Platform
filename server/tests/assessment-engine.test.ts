import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { resetDatabase } from './helpers/db';
import { createAdmin, loginAdmin, type Agent } from './helpers/factories';
import { CATEGORIES, DIFFICULTIES } from './helpers/domain';
import { finalizeExpiredAttempts } from '../src/modules/assessment/assessment.service';

let app: Express;

beforeEach(async () => {
  await resetDatabase();
  app = createApp();
});

afterAll(async () => {
  await prisma.$disconnect();
});

interface Snapshot {
  questionId: string;
  questionText: string;
  options: string[];
  correctOptionIndex: number;
  category: string;
  difficulty: string;
}

interface AttemptState {
  id: string;
  status: string;
  totalQuestions: number;
  answeredCount: number;
  markedCount: number;
  durationMinutes: number;
  passPercentage: number;
  startedAt: string;
  expiresAt: string;
  serverNow: string;
  remainingSeconds: number;
  navigation: Array<{ position: number; answered: boolean; markedForReview: boolean }>;
  result: null | Record<string, unknown>;
}

function candidatePayload(email: string) {
  return {
    fullName: 'Engine Candidate',
    email,
    password: 'StrongPass123!',
    age: 26,
    phone: '9876543210',
    gender: 'FEMALE',
    highestQualification: 'BACHELORS',
    city: 'Pune',
  };
}

async function setupCandidate(
  email = 'engine@example.com',
): Promise<{ agent: Agent; candidateId: string }> {
  const agent = request.agent(app);
  const response = await agent
    .post('/api/candidate/register')
    .send(candidatePayload(email));
  if (response.status !== 201) {
    throw new Error(`candidate setup failed: ${JSON.stringify(response.body)}`);
  }
  return {
    agent,
    candidateId: response.body.data.candidate.id as string,
  };
}

async function setupAdmin(): Promise<Agent> {
  await createAdmin();
  return loginAdmin(app);
}

async function createActiveQuestionBank(
  prefix = 'engine',
  count = 10,
): Promise<Array<{ id: string }>> {
  const created: Array<{ id: string }> = [];
  for (let index = 1; index <= count; index += 1) {
    const correct = index % 4;
    const options = [0, 1, 2, 3].map((optionIndex) =>
      optionIndex === correct
        ? `Correct ${prefix} ${index}`
        : `Option ${optionIndex} ${prefix} ${index}`,
    );
    const question = await prisma.question.create({
      data: {
        questionText: `${prefix} question ${index}?`,
        options,
        correctOptionIndex: correct,
        category: CATEGORIES[index % CATEGORIES.length] ?? 'QUANTITATIVE',
        difficulty: DIFFICULTIES[index % DIFFICULTIES.length] ?? 'EASY',
        isActive: true,
      },
    });
    created.push({ id: question.id });
  }
  return created;
}

async function startAttempt(agent: Agent) {
  return agent.post('/api/candidate/assessment/start');
}

async function getState(agent: Agent) {
  return agent.get('/api/candidate/assessment/attempt');
}

async function getQuestion(agent: Agent, index: number) {
  return agent.get(`/api/candidate/assessment/attempt/questions/${index}`);
}

function saveAnswer(
  agent: Agent,
  index: number,
  body: { selectedOptionIndex?: number | null; markedForReview?: boolean },
) {
  return agent.put(`/api/candidate/assessment/attempt/answers/${index}`).send(body);
}

function submit(agent: Agent, body: Record<string, unknown> = {}) {
  return agent.post('/api/candidate/assessment/submit').send(body);
}

async function dbAttempt(candidateId: string) {
  return prisma.testAttempt.findUnique({
    where: { candidateId },
    include: { answers: true },
  });
}

function snapshotsOf(attempt: {
  questionSnapshots: unknown;
}): Snapshot[] {
  return attempt.questionSnapshots as Snapshot[];
}

describe('assessment instructions and start', () => {
  it('returns instructions with readiness and marking rules', async () => {
    const { agent } = await setupCandidate();

    const notReady = await agent.get('/api/candidate/assessment/instructions');
    expect(notReady.status).toBe(200);
    expect(notReady.body.data.instructions).toMatchObject({
      totalQuestions: 10,
      activeQuestions: 0,
      requiredQuestions: 10,
      ready: false,
      durationMinutes: 15,
      passPercentage: 60,
      correctMarks: 2,
      incorrectMarks: -1,
      unansweredMarks: 0,
      maxScore: 20,
      hasAttempt: false,
    });

    await createActiveQuestionBank();
    const ready = await agent.get('/api/candidate/assessment/instructions');
    expect(ready.body.data.instructions).toMatchObject({
      activeQuestions: 10,
      ready: true,
    });

    const anonymous = await request(app).get(
      '/api/candidate/assessment/instructions',
    );
    expect(anonymous.status).toBe(401);
  });

  it('blocks start when fewer than 10 active questions exist', async () => {
    await createActiveQuestionBank('nine', 9);
    const { agent, candidateId } = await setupCandidate();

    const blocked = await startAttempt(agent);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('ASSESSMENT_NOT_READY');
    expect(blocked.body.error.details).toMatchObject({
      activeQuestions: 9,
      required: 10,
    });
    expect(await prisma.testAttempt.count({ where: { candidateId } })).toBe(0);

    await createActiveQuestionBank('tenth', 1);
    const started = await startAttempt(agent);
    expect(started.status).toBe(201);
  });

  it('starts with a randomized 10-question snapshot and resumes without resetting', async () => {
    const questions = await createActiveQuestionBank();
    const { agent, candidateId } = await setupCandidate();

    const started = await startAttempt(agent);
    expect(started.status).toBe(201);
    const state = started.body.data.attempt as AttemptState;
    expect(state.status).toBe('IN_PROGRESS');
    expect(state.totalQuestions).toBe(10);
    expect(state.answeredCount).toBe(0);
    expect(state.navigation).toHaveLength(10);
    expect(state.remainingSeconds).toBeGreaterThan(0);
    expect(state.remainingSeconds).toBeLessThanOrEqual(900);
    expect(state.result).toBeNull();

    const stored = await dbAttempt(candidateId);
    if (!stored) throw new Error('attempt missing');
    expect(stored.questionOrder).toHaveLength(10);
    expect(new Set(stored.questionOrder).size).toBe(10);
    for (const question of questions) {
      expect(stored.questionOrder).toContain(question.id);
    }
    const snapshots = snapshotsOf(stored);
    expect(snapshots).toHaveLength(10);
    expect(snapshots[0]?.options).toHaveLength(4);

    const resumed = await startAttempt(agent);
    expect(resumed.status).toBe(200);
    expect(resumed.body.data.attempt.id).toBe(state.id);
    expect(await prisma.testAttempt.count({ where: { candidateId } })).toBe(1);

    const refreshed = await getState(agent);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.attempt.id).toBe(state.id);
    expect(refreshed.body.data.attempt.expiresAt).toBe(state.expiresAt);
  });

  it('returns one question at a time with navigation flags and no answer key', async () => {
    await createActiveQuestionBank();
    const { agent } = await setupCandidate();
    await startAttempt(agent);

    const first = await getQuestion(agent, 0);
    expect(first.status).toBe(200);
    expect(first.body.data.question).toMatchObject({
      position: 0,
      number: 1,
      total: 10,
      selectedOptionIndex: null,
      markedForReview: false,
      answered: false,
      hasPrevious: false,
      hasNext: true,
    });
    expect(first.body.data.question.options).toHaveLength(4);
    expect(JSON.stringify(first.body)).not.toContain('correctOptionIndex');

    const last = await getQuestion(agent, 9);
    expect(last.status).toBe(200);
    expect(last.body.data.question).toMatchObject({
      position: 9,
      number: 10,
      hasPrevious: true,
      hasNext: false,
    });

    const outOfRange = await getQuestion(agent, 10);
    expect(outOfRange.status).toBe(400);
    expect(outOfRange.body.error.code).toBe('INVALID_QUESTION_INDEX');

    const negative = await getQuestion(agent, -1);
    expect(negative.status).toBe(400);
  });
});

describe('answers, navigation and review marks', () => {
  it('persists answers, preserves review marks and supports clearing', async () => {
    await createActiveQuestionBank();
    const { agent } = await setupCandidate();
    const started = await startAttempt(agent);
    const attemptId = started.body.data.attempt.id as string;

    const answered = await saveAnswer(agent, 0, { selectedOptionIndex: 2 });
    expect(answered.status).toBe(200);
    expect(answered.body.data.answer).toMatchObject({
      selectedOptionIndex: 2,
      markedForReview: false,
      answeredCount: 1,
      markedCount: 0,
    });

    const marked = await saveAnswer(agent, 0, { markedForReview: true });
    expect(marked.status).toBe(200);
    expect(marked.body.data.answer).toMatchObject({
      selectedOptionIndex: 2,
      markedForReview: true,
    });

    const changedAnswer = await saveAnswer(agent, 0, { selectedOptionIndex: 1 });
    expect(changedAnswer.body.data.answer).toMatchObject({
      selectedOptionIndex: 1,
      markedForReview: true,
    });

    const markOnly = await saveAnswer(agent, 1, { markedForReview: true });
    expect(markOnly.status).toBe(200);
    expect(markOnly.body.data.answer).toMatchObject({
      selectedOptionIndex: null,
      markedForReview: true,
      answeredCount: 1,
      markedCount: 2,
    });

    const state = await getState(agent);
    expect(state.body.data.attempt.id).toBe(attemptId);
    expect(state.body.data.attempt.navigation[0]).toMatchObject({
      answered: true,
      markedForReview: true,
    });
    expect(state.body.data.attempt.navigation[1]).toMatchObject({
      answered: false,
      markedForReview: true,
    });

    const question = await getQuestion(agent, 0);
    expect(question.body.data.question).toMatchObject({
      selectedOptionIndex: 1,
      markedForReview: true,
      answered: true,
    });

    const cleared = await saveAnswer(agent, 0, { selectedOptionIndex: null });
    expect(cleared.body.data.answer).toMatchObject({
      selectedOptionIndex: null,
      markedForReview: true,
      answeredCount: 0,
      markedCount: 2,
    });

    expect((await saveAnswer(agent, 10, { selectedOptionIndex: 1 })).status).toBe(400);
    expect((await saveAnswer(agent, 0, { selectedOptionIndex: 4 })).status).toBe(400);
    expect((await saveAnswer(agent, 0, {})).status).toBe(400);
  });

  it('uses the server clock and does not reset time on refresh', async () => {
    await createActiveQuestionBank();
    const { agent, candidateId } = await setupCandidate();
    await startAttempt(agent);

    const first = await getState(agent);
    const firstRemaining = first.body.data.attempt.remainingSeconds as number;
    const expiresAt = first.body.data.attempt.expiresAt as string;
    expect(firstRemaining).toBeGreaterThan(0);

    const second = await getState(agent);
    expect(second.body.data.attempt.expiresAt).toBe(expiresAt);
    expect(second.body.data.attempt.remainingSeconds).toBeLessThanOrEqual(
      firstRemaining + 1,
    );

    const now = Date.now();
    await prisma.testAttempt.update({
      where: { candidateId },
      data: {
        startedAt: new Date(now - 60_000),
        expiresAt: new Date(now + 90_000),
      },
    });
    const adjusted = await getState(agent);
    const remaining = adjusted.body.data.attempt.remainingSeconds as number;
    expect(remaining).toBeGreaterThan(80);
    expect(remaining).toBeLessThanOrEqual(90);

    const stored = await prisma.testAttempt.findUnique({ where: { candidateId } });
    expect(stored?.expiresAt.toISOString()).toBe(adjusted.body.data.attempt.expiresAt);
  });
});

describe('scoring and submission', () => {
  it('scores with +2/-1/0, max 20, negative allowed and ignores client data', async () => {
    await createActiveQuestionBank();
    const { agent, candidateId } = await setupCandidate();
    const started = await startAttempt(agent);
    const stored = await dbAttempt(candidateId);
    if (!stored) throw new Error('attempt missing');
    const snapshots = snapshotsOf(stored);

    for (let position = 0; position < 7; position += 1) {
      const snapshot = snapshots[position];
      if (!snapshot) throw new Error('missing snapshot');
      await saveAnswer(agent, position, {
        selectedOptionIndex: snapshot.correctOptionIndex,
      });
    }
    for (let position = 7; position < 9; position += 1) {
      const snapshot = snapshots[position];
      if (!snapshot) throw new Error('missing snapshot');
      await saveAnswer(agent, position, {
        selectedOptionIndex: (snapshot.correctOptionIndex + 1) % 4,
      });
    }

    const submitted = await submit(agent, {
      netScore: 20,
      percentage: 100,
      submittedAt: '2000-01-01T00:00:00.000Z',
      correctCount: 10,
    });
    expect(submitted.status).toBe(200);
    const result = submitted.body.data.result;
    expect(result).toMatchObject({
      status: 'COMPLETED',
      totalQuestions: 10,
      correctCount: 7,
      incorrectCount: 2,
      unattemptedCount: 1,
      netScore: 12,
      marksDeducted: 2,
      maxScore: 20,
      percentage: 60,
      passPercentage: 60,
      passed: true,
    });
    expect(result.submittedAt).not.toBe('2000-01-01T00:00:00.000Z');
    expect(result.timeTakenSeconds).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(result)).not.toContain('correctOptionIndex');

    const dbStored = await prisma.testAttempt.findUnique({
      where: { id: started.body.data.attempt.id },
    });
    expect(dbStored).toMatchObject({
      status: 'COMPLETED',
      netScore: 12,
      percentage: 60,
      correctCount: 7,
      incorrectCount: 2,
      unattemptedCount: 1,
      marksDeducted: 2,
      result: 'PASS',
    });

    const fetched = await agent.get('/api/candidate/assessment/result');
    expect(fetched.status).toBe(200);
    expect(fetched.body.data.result.netScore).toBe(12);
  });

  it('allows negative net scores and negative percentages', async () => {
    await createActiveQuestionBank();
    const { agent, candidateId } = await setupCandidate();
    await startAttempt(agent);
    const stored = await dbAttempt(candidateId);
    if (!stored) throw new Error('attempt missing');
    const snapshots = snapshotsOf(stored);

    for (let position = 0; position < snapshots.length; position += 1) {
      const snapshot = snapshots[position];
      if (!snapshot) continue;
      await saveAnswer(agent, position, {
        selectedOptionIndex: (snapshot.correctOptionIndex + 1) % 4,
      });
    }

    const submitted = await submit(agent);
    const result = submitted.body.data.result;
    expect(result).toMatchObject({
      correctCount: 0,
      incorrectCount: 10,
      unattemptedCount: 0,
      netScore: -10,
      marksDeducted: 10,
      percentage: -50,
      passed: false,
      status: 'COMPLETED',
    });

    const dbStored = await prisma.testAttempt.findUnique({
      where: { candidateId },
    });
    expect(dbStored?.percentage).toBe(-50);
    expect(dbStored?.netScore).toBe(-10);
  });

  it('counts an empty submission as fully unattempted', async () => {
    await createActiveQuestionBank();
    const { agent } = await setupCandidate();
    await startAttempt(agent);

    const submitted = await submit(agent);
    expect(submitted.status).toBe(200);
    expect(submitted.body.data.result).toMatchObject({
      correctCount: 0,
      incorrectCount: 0,
      unattemptedCount: 10,
      netScore: 0,
      percentage: 0,
      passed: false,
    });
  });

  it('does not allow reading a result before submission', async () => {
    await createActiveQuestionBank();
    const { agent } = await setupCandidate();
    await startAttempt(agent);

    const response = await agent.get('/api/candidate/assessment/result');
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ASSESSMENT_NOT_SUBMITTED');
  });

  it('is idempotent and safe under concurrent submissions', async () => {
    await createActiveQuestionBank();
    const { agent, candidateId } = await setupCandidate();
    await startAttempt(agent);
    await saveAnswer(agent, 0, { selectedOptionIndex: 0 });

    const responses = await Promise.all([submit(agent), submit(agent)]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const first = responses[0]?.body.data.result;
    const second = responses[1]?.body.data.result;
    expect(first.netScore).toBe(second.netScore);
    expect(first.submittedAt).toBe(second.submittedAt);
    expect(first.status).toBe(second.status);

    const again = await submit(agent);
    expect(again.status).toBe(200);
    expect(again.body.data.result.submittedAt).toBe(first.submittedAt);

    const stored = await prisma.testAttempt.findUnique({
      where: { candidateId },
    });
    expect(stored?.status).toBe(again.body.data.result.status);
    expect(stored?.submittedAt?.toISOString()).toBe(first.submittedAt);

    const lateAnswer = await saveAnswer(agent, 1, { selectedOptionIndex: 1 });
    expect(lateAnswer.status).toBe(409);
    expect(lateAnswer.body.error.code).toBe('ATTEMPT_FINALIZED');
  });
});

describe('expiration', () => {
  it('rejects answers after expiry and finalizes with saved answers', async () => {
    await createActiveQuestionBank();
    const { agent, candidateId } = await setupCandidate();
    await startAttempt(agent);
    const stored = await dbAttempt(candidateId);
    if (!stored) throw new Error('attempt missing');
    const snapshots = snapshotsOf(stored);

    for (let position = 0; position < 3; position += 1) {
      const snapshot = snapshots[position];
      if (!snapshot) continue;
      await saveAnswer(agent, position, {
        selectedOptionIndex: snapshot.correctOptionIndex,
      });
    }

    const past = new Date(Date.now() - 1_000);
    await prisma.testAttempt.update({
      where: { candidateId },
      data: { startedAt: new Date(past.getTime() - 60_000), expiresAt: past },
    });

    const rejected = await saveAnswer(agent, 4, { selectedOptionIndex: 0 });
    expect(rejected.status).toBe(410);
    expect(rejected.body.error.code).toBe('ATTEMPT_EXPIRED');

    const finalized = await prisma.testAttempt.findUnique({
      where: { candidateId },
    });
    expect(finalized?.status).toBe('EXPIRED');
    expect(finalized?.submittedAt?.toISOString()).toBe(past.toISOString());
    expect(finalized).toMatchObject({
      correctCount: 3,
      incorrectCount: 0,
      unattemptedCount: 7,
      netScore: 6,
      percentage: 30,
      result: 'FAIL',
    });

    const state = await getState(agent);
    expect(state.body.data.attempt.status).toBe('EXPIRED');
    expect(state.body.data.attempt.remainingSeconds).toBe(0);
    expect(state.body.data.attempt.result).toMatchObject({ netScore: 6 });
  });

  it('finalizes expired attempts on read and via the sweeper without the candidate', async () => {
    await createActiveQuestionBank();
    const first = await setupCandidate('first-expiry@example.com');
    const second = await setupCandidate('second-expiry@example.com');
    await startAttempt(first.agent);
    await startAttempt(second.agent);

    const past = new Date(Date.now() - 5_000);
    await prisma.testAttempt.updateMany({
      where: {
        candidateId: { in: [first.candidateId, second.candidateId] },
      },
      data: {
        startedAt: new Date(past.getTime() - 15 * 60_000),
        expiresAt: past,
      },
    });

    const lazy = await getState(first.agent);
    expect(lazy.body.data.attempt.status).toBe('EXPIRED');
    expect(lazy.body.data.attempt.result).not.toBeNull();

    const stillInProgress = await prisma.testAttempt.findUnique({
      where: { candidateId: second.candidateId },
    });
    expect(stillInProgress?.status).toBe('IN_PROGRESS');

    const finalizedCount = await finalizeExpiredAttempts();
    expect(finalizedCount).toBe(1);

    const swept = await prisma.testAttempt.findUnique({
      where: { candidateId: second.candidateId },
    });
    expect(swept?.status).toBe('EXPIRED');
    expect(swept?.percentage).toBe(0);
    expect(swept?.unattemptedCount).toBe(10);

    expect(await finalizeExpiredAttempts()).toBe(0);

    const result = await second.agent.get('/api/candidate/assessment/result');
    expect(result.status).toBe(200);
    expect(result.body.data.result.status).toBe('EXPIRED');
  });

  it('lazily finalizes when reading the result after expiry', async () => {
    await createActiveQuestionBank();
    const { agent, candidateId } = await setupCandidate();
    await startAttempt(agent);

    const past = new Date(Date.now() - 2_000);
    await prisma.testAttempt.update({
      where: { candidateId },
      data: { startedAt: new Date(past.getTime() - 60_000), expiresAt: past },
    });

    const result = await agent.get('/api/candidate/assessment/result');
    expect(result.status).toBe(200);
    expect(result.body.data.result.status).toBe('EXPIRED');
  });
});

describe('snapshots and security', () => {
  it('keeps duration, pass percentage and question text snapshotted', async () => {
    const questions = await createActiveQuestionBank();
    const admin = await setupAdmin();
    const { agent, candidateId } = await setupCandidate();
    await startAttempt(agent);

    const stored = await dbAttempt(candidateId);
    if (!stored) throw new Error('attempt missing');
    const snapshots = snapshotsOf(stored);
    const firstSnapshot = snapshots[0];
    if (!firstSnapshot) throw new Error('missing snapshot');
    expect(stored.durationMinutes).toBe(15);
    expect(stored.passPercentage).toBe(60);

    const settingsUpdate = await admin.put('/api/admin/settings').send({
      assessmentDurationMinutes: 45,
      passPercentage: 90,
    });
    expect(settingsUpdate.status).toBe(200);

    const edited = await admin
      .put(`/api/admin/questions/${firstSnapshot.questionId}`)
      .send({
        questionText: 'Live question edited after the attempt began?',
        options: ['Live A', 'Live B', 'Live C', 'Live D'],
        correctOptionIndex: 0,
        category: 'LOGICAL',
        difficulty: 'HARD',
      });
    expect(edited.status).toBe(200);

    const questionView = await getQuestion(agent, 0);
    expect(questionView.status).toBe(200);
    expect(questionView.body.data.question.questionText).toBe(
      firstSnapshot.questionText,
    );
    expect(questionView.body.data.question.options).toEqual(firstSnapshot.options);

    for (let position = 0; position < snapshots.length; position += 1) {
      const snapshot = snapshots[position];
      if (!snapshot) continue;
      await saveAnswer(agent, position, {
        selectedOptionIndex: snapshot.correctOptionIndex,
      });
    }
    const submitted = await submit(agent);
    expect(submitted.body.data.result).toMatchObject({
      netScore: 20,
      percentage: 100,
      passPercentage: 60,
      passed: true,
    });

    const after = await prisma.testAttempt.findUnique({ where: { candidateId } });
    expect(after?.durationMinutes).toBe(15);
    expect(after?.passPercentage).toBe(60);
    expect(questions.length).toBe(10);
  });

  it('isolates candidates, requires candidate auth and never exposes answer keys', async () => {
    await createActiveQuestionBank();
    const first = await setupCandidate('owner@example.com');
    const second = await setupCandidate('intruder@example.com');
    await startAttempt(first.agent);
    await startAttempt(second.agent);

    const firstState = await getState(first.agent);
    const secondState = await getState(second.agent);
    expect(firstState.body.data.attempt.id).not.toBe(
      secondState.body.data.attempt.id,
    );

    await saveAnswer(first.agent, 0, { selectedOptionIndex: 1 });
    const secondAfter = await getState(second.agent);
    expect(secondAfter.body.data.attempt.answeredCount).toBe(0);

    const anonymous = await request(app).get('/api/candidate/assessment/attempt');
    expect(anonymous.status).toBe(401);

    const admin = await setupAdmin();
    const adminAttempt = await admin.get('/api/candidate/assessment/attempt');
    expect(adminAttempt.status).toBe(401);

    const candidateOnAdmin = await first.agent.get('/api/admin/overview');
    expect(candidateOnAdmin.status).toBe(401);

    const question = await getQuestion(first.agent, 0);
    expect(JSON.stringify(question.body)).not.toContain('correctOptionIndex');
    expect(JSON.stringify(firstState.body)).not.toContain('correctOptionIndex');
    expect(JSON.stringify(firstState.body)).not.toContain('questionSnapshots');

    await submit(first.agent);
    const result = await first.agent.get('/api/candidate/assessment/result');
    expect(JSON.stringify(result.body)).not.toContain('correctOptionIndex');
  });
});
