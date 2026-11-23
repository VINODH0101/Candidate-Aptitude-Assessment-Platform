import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { resetDatabase } from './helpers/db';
import { createAdmin, loginAdmin } from './helpers/factories';
import { CATEGORIES, DIFFICULTIES } from './helpers/domain';

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
}

async function createActiveQuestionBank(prefix = 'results') {
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

async function snapshotsFor(candidateId: string): Promise<Snapshot[]> {
  const attempt = await prisma.testAttempt.findUnique({ where: { candidateId } });
  if (!attempt) throw new Error('attempt missing');
  return attempt.questionSnapshots as unknown as Snapshot[];
}

describe('candidate results', () => {
  it('returns a summary with candidate name and a detailed review after submission', async () => {
    await createActiveQuestionBank();
    const { agent, candidateId } = await setupCandidate(
      'result.candidate@example.com',
      'Result Candidate',
    );
    const attempt = await start(agent);
    const snapshots = await snapshotsFor(candidateId);

    const beforeResult = await agent.get('/api/candidate/assessment/result');
    expect(beforeResult.status).toBe(409);
    const beforeReview = await agent.get('/api/candidate/assessment/result/review');
    expect(beforeReview.status).toBe(409);

    for (let position = 0; position < 7; position += 1) {
      const snapshot = snapshots[position];
      if (!snapshot) continue;
      await agent
        .put(`/api/candidate/assessment/attempt/answers/${position}`)
        .send({ selectedOptionIndex: snapshot.correctOptionIndex });
    }
    for (let position = 7; position < 9; position += 1) {
      const snapshot = snapshots[position];
      if (!snapshot) continue;
      await agent
        .put(`/api/candidate/assessment/attempt/answers/${position}`)
        .send({ selectedOptionIndex: (snapshot.correctOptionIndex + 1) % 4 });
    }
    const submitted = await agent.post('/api/candidate/assessment/submit');
    expect(submitted.status).toBe(200);

    const summaryResponse = await agent.get('/api/candidate/assessment/result');
    expect(summaryResponse.status).toBe(200);
    const summary = summaryResponse.body.data.result;
    expect(summary).toMatchObject({
      candidateName: 'Result Candidate',
      attemptId: attempt.id,
      status: 'COMPLETED',
      totalQuestions: 10,
      correctCount: 7,
      incorrectCount: 2,
      unattemptedCount: 1,
      netScore: 12,
      maxScore: 20,
      percentage: 60,
      marksDeducted: 2,
      passed: true,
      passPercentage: 60,
    });
    expect(summary.timeTakenSeconds).toBeGreaterThanOrEqual(0);
    expect(summary.submittedAt).toBeTruthy();
    expect(JSON.stringify(summary)).not.toContain('correctOptionIndex');

    const reviewResponse = await agent.get('/api/candidate/assessment/result/review');
    expect(reviewResponse.status).toBe(200);
    const review = reviewResponse.body.data.review;
    expect(review.candidateName).toBe('Result Candidate');
    expect(review.questions).toHaveLength(10);
    expect(review.questions[0]).toMatchObject({
      outcome: 'CORRECT',
      selectedOptionIndex: snapshots[0]?.correctOptionIndex,
      correctOptionIndex: snapshots[0]?.correctOptionIndex,
    });
    const firstSnapshot = snapshots[0];
    if (!firstSnapshot) throw new Error('missing snapshot');
    expect(review.questions[0].selectedAnswer).toBe(
      firstSnapshot.options[firstSnapshot.correctOptionIndex],
    );
    expect(review.questions[0].correctAnswer).toBe(
      firstSnapshot.options[firstSnapshot.correctOptionIndex],
    );
    expect(review.questions[7]).toMatchObject({ outcome: 'INCORRECT' });
    expect(review.questions[7].selectedOptionIndex).not.toBe(
      review.questions[7].correctOptionIndex,
    );
    expect(review.questions[9]).toMatchObject({
      outcome: 'UNANSWERED',
      selectedOptionIndex: null,
      selectedAnswer: null,
    });
    expect(review.questions[9].correctAnswer).toBeTruthy();
    expect(JSON.stringify(review)).toContain('correctOptionIndex');
  });

  it('keeps results scoped to the authenticated candidate', async () => {
    await createActiveQuestionBank();
    const first = await setupCandidate('first@example.com', 'First Candidate');
    const second = await setupCandidate('second@example.com', 'Second Candidate');
    const firstAttempt = await start(first.agent);
    await start(second.agent);

    const firstSnapshots = await snapshotsFor(first.candidateId);
    for (let position = 0; position < 10; position += 1) {
      const snapshot = firstSnapshots[position];
      if (!snapshot) continue;
      await first.agent
        .put(`/api/candidate/assessment/attempt/answers/${position}`)
        .send({ selectedOptionIndex: snapshot.correctOptionIndex });
    }
    await first.agent.post('/api/candidate/assessment/submit');

    const firstResult = await first.agent.get('/api/candidate/assessment/result');
    expect(firstResult.status).toBe(200);
    expect(firstResult.body.data.result.attemptId).toBe(firstAttempt.id);

    const secondBefore = await second.agent.get('/api/candidate/assessment/result');
    expect(secondBefore.status).toBe(409);

    await second.agent.post('/api/candidate/assessment/submit');
    const secondResult = await second.agent.get('/api/candidate/assessment/result');
    expect(secondResult.status).toBe(200);
    expect(secondResult.body.data.result.attemptId).not.toBe(firstAttempt.id);

    const anonymous = await request(app).get(
      '/api/candidate/assessment/result/review',
    );
    expect(anonymous.status).toBe(401);

    await createAdmin();
    const admin = await loginAdmin(app);
    const adminOnCandidate = await admin.get('/api/candidate/assessment/result');
    expect(adminOnCandidate.status).toBe(401);
  });

  it('allows reviewing an expired attempt with correct answers', async () => {
    await createActiveQuestionBank();
    const { agent, candidateId } = await setupCandidate(
      'expired.result@example.com',
      'Expired Candidate',
    );
    await start(agent);
    const snapshots = await snapshotsFor(candidateId);

    for (let position = 0; position < 3; position += 1) {
      const snapshot = snapshots[position];
      if (!snapshot) continue;
      await agent
        .put(`/api/candidate/assessment/attempt/answers/${position}`)
        .send({ selectedOptionIndex: snapshot.correctOptionIndex });
    }

    const past = new Date(Date.now() - 5_000);
    await prisma.testAttempt.update({
      where: { candidateId },
      data: {
        startedAt: new Date(past.getTime() - 15 * 60_000),
        expiresAt: past,
      },
    });

    const summary = await agent.get('/api/candidate/assessment/result');
    expect(summary.status).toBe(200);
    expect(summary.body.data.result).toMatchObject({
      status: 'EXPIRED',
      correctCount: 3,
      unattemptedCount: 7,
      netScore: 6,
      percentage: 30,
      passed: false,
    });

    const review = await agent.get('/api/candidate/assessment/result/review');
    expect(review.status).toBe(200);
    expect(review.body.data.review.status).toBe('EXPIRED');
    expect(review.body.data.review.questions).toHaveLength(10);
    expect(review.body.data.review.questions[0].correctAnswer).toBeTruthy();
  });
});
