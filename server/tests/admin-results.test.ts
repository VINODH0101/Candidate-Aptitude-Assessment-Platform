import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { resetDatabase } from './helpers/db';
import { createAdmin, loginAdmin, type Agent } from './helpers/factories';
import {
  CATEGORIES,
  DIFFICULTIES,
  createCandidate,
  createFinalizedAttempt,
  createInProgressAttempt,
} from './helpers/domain';

let app: Express;

beforeEach(async () => {
  await resetDatabase();
  app = createApp();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function setupAdmin(): Promise<Agent> {
  await createAdmin();
  return loginAdmin(app);
}

async function createActiveQuestionBank(prefix = 'detail') {
  for (let index = 1; index <= 10; index += 1) {
    const correct = index % 4;
    const options = [0, 1, 2, 3].map((optionIndex) =>
      optionIndex === correct
        ? `Correct ${prefix} ${index}`
        : `Option ${optionIndex} ${prefix} ${index}`,
    );
    await prisma.question.create({
      data: {
        questionText: `${prefix} question ${index}?`,
        options,
        correctOptionIndex: correct,
        category: CATEGORIES[index % CATEGORIES.length] ?? 'QUANTITATIVE',
        difficulty: DIFFICULTIES[index % DIFFICULTIES.length] ?? 'EASY',
        isActive: true,
      },
    });
  }
}

async function setupCandidate(email: string, fullName: string) {
  const agent = request.agent(app);
  const response = await agent.post('/api/candidate/register').send({
    fullName,
    email,
    password: 'StrongPass123!',
    age: 26,
    phone: '9876543210',
    gender: 'FEMALE',
    highestQualification: 'BACHELORS',
    city: 'Pune',
  });
  if (response.status !== 201) {
    throw new Error(`candidate setup failed: ${JSON.stringify(response.body)}`);
  }
  return {
    agent,
    candidateId: response.body.data.candidate.id as string,
  };
}

async function start(agent: ReturnType<typeof request.agent>) {
  const response = await agent.post('/api/candidate/assessment/start');
  if (response.status !== 201) {
    throw new Error(`start failed: ${JSON.stringify(response.body)}`);
  }
  return response.body.data.attempt as { id: string };
}

interface Snapshot {
  questionId: string;
  options: string[];
  correctOptionIndex: number;
}

async function snapshotsFor(candidateId: string): Promise<Snapshot[]> {
  const attempt = await prisma.testAttempt.findUnique({ where: { candidateId } });
  if (!attempt) throw new Error('attempt missing');
  return attempt.questionSnapshots as unknown as Snapshot[];
}

const COUNTS: Array<[number, number, number]> = [
  [10, 0, 0],
  [9, 0, 1],
  [8, 0, 2],
  [7, 0, 3],
  [6, 0, 4],
  [5, 0, 5],
  [4, 0, 6],
  [3, 0, 7],
  [2, 0, 8],
  [1, 0, 9],
  [0, 10, 0],
  [0, 0, 10],
];

async function seedTwelveResults(): Promise<void> {
  const base = Date.now();
  for (let index = 1; index <= 12; index += 1) {
    const counts = COUNTS[index - 1];
    if (!counts) continue;
    const [correct, incorrect, unattempted] = counts;
    await createFinalizedAttempt({
      fullName: `Candidate ${String.fromCharCode(64 + index)}`,
      email: `candidate${index}@example.com`,
      correct,
      incorrect,
      unattempted,
      status: index === 12 ? 'EXPIRED' : 'COMPLETED',
      startedAt: new Date(base - index * 3_600_000),
    });
  }
}

describe('admin results and analytics - empty data', () => {
  it('returns empty paginated results and zeroed analytics', async () => {
    const admin = await setupAdmin();

    const results = await admin.get('/api/admin/results');
    expect(results.status).toBe(200);
    expect(results.body.data.results).toMatchObject({
      items: [],
      page: 1,
      pageSize: 10,
      totalPages: 0,
      totalCount: 0,
      filteredCount: 0,
    });

    const analytics = await admin.get('/api/admin/analytics');
    expect(analytics.status).toBe(200);
    const data = analytics.body.data.analytics;
    expect(data.totals).toMatchObject({
      candidatesRegistered: 0,
      completedAssessments: 0,
      expiredAssessments: 0,
      finalizedAssessments: 0,
      inProgressAttempts: 0,
    });
    expect(data.performance).toMatchObject({
      averageNetScore: 0,
      averagePercentage: 0,
      highestNetScore: 0,
      highestPercentage: 0,
      passRate: 0,
      passedCount: 0,
      failedCount: 0,
    });
    expect(data.passFailDistribution).toEqual([
      { result: 'PASS', count: 0 },
      { result: 'FAIL', count: 0 },
    ]);
    expect(data.scoreDistribution).toHaveLength(6);
    expect(
      (data.scoreDistribution as Array<{ count: number }>).every(
        (bucket) => bucket.count === 0,
      ),
    ).toBe(true);

    const detail = await admin.get(`/api/admin/results/${randomUUID()}`);
    expect(detail.status).toBe(404);
    expect(detail.body.error.code).toBe('RESULT_NOT_FOUND');
  });
});

describe('admin results management', () => {
  it('paginates, searches, filters and sorts in the database', async () => {
    const admin = await setupAdmin();
    await seedTwelveResults();

    const defaultList = await admin.get('/api/admin/results');
    expect(defaultList.status).toBe(200);
    expect(defaultList.body.data.results).toMatchObject({
      page: 1,
      pageSize: 10,
      totalCount: 12,
      filteredCount: 12,
      totalPages: 2,
    });
    expect(defaultList.body.data.results.items).toHaveLength(10);
    expect(defaultList.body.data.results.items[0].candidate.fullName).toBe(
      'Candidate A',
    );
    expect(defaultList.body.data.results.items[0].candidate).toMatchObject({
      phone: '9876543210',
      age: 25,
    });
    expect(defaultList.body.data.results.items[0].netScore).toBe(20);

    const pageTwo = await admin.get('/api/admin/results?page=2&pageSize=10');
    expect(pageTwo.body.data.results.items).toHaveLength(2);
    expect(pageTwo.body.data.results.totalPages).toBe(2);
    expect(
      pageTwo.body.data.results.items.some(
        (item: { status: string }) => item.status === 'EXPIRED',
      ),
    ).toBe(true);

    const byName = await admin.get('/api/admin/results?search=Candidate%20C');
    expect(byName.body.data.results.filteredCount).toBe(1);
    expect(byName.body.data.results.items[0].candidate.fullName).toBe(
      'Candidate C',
    );

    const byEmail = await admin.get('/api/admin/results?search=candidate3%40example.com');
    expect(byEmail.body.data.results.filteredCount).toBe(1);

    const fails = await admin.get('/api/admin/results?result=FAIL');
    expect(fails.body.data.results.filteredCount).toBe(7);
    expect(fails.body.data.results.totalCount).toBe(12);
    expect(
      fails.body.data.results.items.every(
        (item: { passed: boolean }) => item.passed === false,
      ),
    ).toBe(true);

    const passes = await admin.get('/api/admin/results?result=PASS');
    expect(passes.body.data.results.filteredCount).toBe(5);

    const scoreAsc = await admin.get(
      '/api/admin/results?sortBy=score&sortOrder=asc',
    );
    expect(scoreAsc.body.data.results.items[0].netScore).toBe(-10);

    const scoreDesc = await admin.get(
      '/api/admin/results?sortBy=score&sortOrder=desc',
    );
    expect(scoreDesc.body.data.results.items[0].netScore).toBe(20);

    const dateAsc = await admin.get(
      '/api/admin/results?sortBy=attemptDate&sortOrder=asc',
    );
    expect(dateAsc.body.data.results.items[0].candidate.fullName).toBe(
      'Candidate L',
    );

    const dateDesc = await admin.get(
      '/api/admin/results?sortBy=attemptDate&sortOrder=desc',
    );
    expect(dateDesc.body.data.results.items[0].candidate.fullName).toBe(
      'Candidate A',
    );
  });

  it('validates pagination, sorting and filter parameters', async () => {
    const admin = await setupAdmin();

    for (const path of [
      '/api/admin/results?page=0',
      '/api/admin/results?page=abc',
      '/api/admin/results?pageSize=0',
      '/api/admin/results?pageSize=101',
      '/api/admin/results?sortBy=unknown',
      '/api/admin/results?sortOrder=sideways',
      '/api/admin/results?result=MAYBE',
    ]) {
      const response = await admin.get(path);
      expect(response.status, path).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('returns candidate detail with correct answers and excludes in-progress attempts', async () => {
    await createActiveQuestionBank();
    const admin = await setupAdmin();
    const candidate = await setupCandidate('detail@example.com', 'Detail Candidate');
    const attempt = await start(candidate.agent);
    const snapshots = await snapshotsFor(candidate.candidateId);

    for (let position = 0; position < 3; position += 1) {
      const snapshot = snapshots[position];
      if (!snapshot) continue;
      await candidate.agent
        .put(`/api/candidate/assessment/attempt/answers/${position}`)
        .send({ selectedOptionIndex: snapshot.correctOptionIndex });
    }
    for (let position = 3; position < 5; position += 1) {
      const snapshot = snapshots[position];
      if (!snapshot) continue;
      await candidate.agent
        .put(`/api/candidate/assessment/attempt/answers/${position}`)
        .send({ selectedOptionIndex: (snapshot.correctOptionIndex + 1) % 4 });
    }
    await candidate.agent.post('/api/candidate/assessment/submit');

    const detail = await admin.get(`/api/admin/results/${attempt.id}`);
    expect(detail.status).toBe(200);
    const result = detail.body.data.result;
    expect(result).toMatchObject({
      attemptId: attempt.id,
      candidate: { fullName: 'Detail Candidate', email: 'detail@example.com' },
      status: 'COMPLETED',
      outcome: 'FAIL',
      passed: false,
      totalQuestions: 10,
      correctCount: 3,
      incorrectCount: 2,
      unattemptedCount: 5,
      netScore: 4,
      maxScore: 20,
      percentage: 20,
      marksDeducted: 2,
    });
    expect(result.candidate).toMatchObject({
      age: 26,
      phone: '9876543210',
      highestQualification: 'BACHELORS',
      city: 'Pune',
    });
    expect(result.questions).toHaveLength(10);
    expect(result.questions[0]).toMatchObject({ outcome: 'CORRECT' });
    const firstSnapshot = snapshots[0];
    if (!firstSnapshot) throw new Error('missing snapshot');
    expect(result.questions[0].correctAnswer).toBe(
      firstSnapshot.options[firstSnapshot.correctOptionIndex],
    );
    expect(result.questions[0].selectedAnswer).toBe(
      firstSnapshot.options[firstSnapshot.correctOptionIndex],
    );
    expect(result.questions[3]).toMatchObject({ outcome: 'INCORRECT' });
    expect(result.questions[5]).toMatchObject({
      outcome: 'UNANSWERED',
      selectedOptionIndex: null,
      selectedAnswer: null,
    });

    const inProgressCandidate = await setupCandidate(
      'inprogress@example.com',
      'In Progress',
    );
    const inProgressAttempt = await start(inProgressCandidate.agent);
    const blocked = await admin.get(`/api/admin/results/${inProgressAttempt.id}`);
    expect(blocked.status).toBe(404);
    expect(blocked.body.error.code).toBe('RESULT_NOT_FOUND');
  });

  it('requires an admin session for results and analytics', async () => {
    const anonymousResults = await request(app).get('/api/admin/results');
    expect(anonymousResults.status).toBe(401);
    const anonymousAnalytics = await request(app).get('/api/admin/analytics');
    expect(anonymousAnalytics.status).toBe(401);

    const candidate = await setupCandidate('noadmin@example.com', 'No Admin');
    const candidateResults = await candidate.agent.get('/api/admin/results');
    expect(candidateResults.status).toBe(401);
    const candidateAnalytics = await candidate.agent.get('/api/admin/analytics');
    expect(candidateAnalytics.status).toBe(401);
  });
});

describe('admin analytics', () => {
  it('aggregates finalized attempts, including expired, and excludes in-progress', async () => {
    const admin = await setupAdmin();

    const completed = [
      { correct: 10, incorrect: 0, unattempted: 0 },
      { correct: 8, incorrect: 0, unattempted: 2 },
      { correct: 6, incorrect: 0, unattempted: 4 },
      { correct: 4, incorrect: 0, unattempted: 6 },
      { correct: 0, incorrect: 10, unattempted: 0 },
    ];
    for (let index = 0; index < completed.length; index += 1) {
      const counts = completed[index];
      if (!counts) continue;
      await createFinalizedAttempt({
        fullName: `Analytics ${String.fromCharCode(65 + index)}`,
        email: `analytics${index + 1}@example.com`,
        correct: counts.correct,
        incorrect: counts.incorrect,
        unattempted: counts.unattempted,
        status: 'COMPLETED',
      });
    }

    await createFinalizedAttempt({
      fullName: 'Expired Result',
      email: 'expired.result@example.com',
      correct: 0,
      incorrect: 0,
      unattempted: 10,
      status: 'EXPIRED',
    });

    await createInProgressAttempt({
      fullName: 'In Progress',
      email: 'inprogress.analytics@example.com',
    });

    await createCandidate('no-attempt@example.com');

    const response = await admin.get('/api/admin/analytics');
    expect(response.status).toBe(200);
    const analytics = response.body.data.analytics;

    expect(analytics.totals).toMatchObject({
      candidatesRegistered: 8,
      completedAssessments: 5,
      expiredAssessments: 1,
      finalizedAssessments: 6,
      inProgressAttempts: 1,
    });
    expect(analytics.performance).toMatchObject({
      averageNetScore: 7.67,
      averagePercentage: 38.33,
      highestNetScore: 20,
      highestPercentage: 100,
      passRate: 50,
      passedCount: 3,
      failedCount: 3,
    });
    expect(analytics.passFailDistribution).toEqual([
      { result: 'PASS', count: 3 },
      { result: 'FAIL', count: 3 },
    ]);

    const distribution = new Map(
      (analytics.scoreDistribution as Array<{ bucket: string; count: number }>).map(
        (entry) => [entry.bucket, entry.count],
      ),
    );
    expect(distribution.get('below 0')).toBe(1);
    expect(distribution.get('0-19')).toBe(1);
    expect(distribution.get('20-39')).toBe(0);
    expect(distribution.get('40-59')).toBe(1);
    expect(distribution.get('60-79')).toBe(1);
    expect(distribution.get('80-100')).toBe(2);
  });
});
