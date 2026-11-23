import bcrypt from 'bcryptjs';
import { prisma } from '../../src/lib/prisma';
import type { Agent } from './factories';

export const CATEGORIES = ['QUANTITATIVE', 'LOGICAL', 'VERBAL'] as const;
export const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;

export interface QuestionRecord {
  id: string;
  questionText: string;
  options: string[];
  correctOptionIndex: number;
  category: string;
  difficulty: string;
  isActive: boolean;
}

export interface QuestionOverrides {
  questionText?: string;
  options?: string[];
  correctOptionIndex?: number;
  category?: (typeof CATEGORIES)[number];
  difficulty?: (typeof DIFFICULTIES)[number];
}

export function questionPayload(index: number, overrides: QuestionOverrides = {}) {
  return {
    questionText:
      overrides.questionText ??
      `Corporate aptitude question ${index}: which option is correct?`,
    options:
      overrides.options ?? [
        `Correct option ${index}`,
        `Wrong option ${index} A`,
        `Wrong option ${index} B`,
        `Wrong option ${index} C`,
      ],
    correctOptionIndex: overrides.correctOptionIndex ?? 0,
    category: overrides.category ?? CATEGORIES[index % CATEGORIES.length],
    difficulty: overrides.difficulty ?? DIFFICULTIES[index % DIFFICULTIES.length],
  };
}

export async function createQuestion(
  admin: Agent,
  index: number,
  overrides: QuestionOverrides = {},
  activate = false,
): Promise<QuestionRecord> {
  const created = await admin
    .post('/api/admin/questions')
    .send(questionPayload(index, overrides));
  if (created.status !== 201) {
    throw new Error(
      `createQuestion ${index} failed: ${created.status} ${JSON.stringify(created.body)}`,
    );
  }
  const question = created.body.data.question as QuestionRecord;
  if (!activate) return question;

  const activated = await admin
    .patch(`/api/admin/questions/${question.id}/status`)
    .send({ isActive: true });
  if (activated.status !== 200) {
    throw new Error(
      `activateQuestion ${index} failed: ${activated.status} ${JSON.stringify(activated.body)}`,
    );
  }
  return activated.body.data.question as QuestionRecord;
}

export async function createActiveQuestions(
  admin: Agent,
  count = 10,
): Promise<QuestionRecord[]> {
  const questions: QuestionRecord[] = [];
  for (let index = 1; index <= count; index += 1) {
    questions.push(await createQuestion(admin, index, {}, true));
  }
  return questions;
}

export async function createCandidate(email = 'attempt.candidate@example.com') {
  const passwordHash = await bcrypt.hash('Password123!', 8);
  return prisma.candidate.create({
    data: {
      fullName: 'Attempt Candidate',
      email,
      passwordHash,
      age: 27,
      phone: '9876543210',
      gender: 'FEMALE',
      highestQualification: 'BACHELORS',
      city: 'Pune',
    },
  });
}

export interface FinalizedAttemptOptions {
  fullName: string;
  email: string;
  correct: number;
  incorrect: number;
  unattempted: number;
  status?: 'COMPLETED' | 'EXPIRED';
  startedAt?: Date;
  submittedAt?: Date;
  passPercentage?: number;
}

async function createResultCandidate(fullName: string, email: string) {
  const passwordHash = await bcrypt.hash('Password123!', 8);
  return prisma.candidate.create({
    data: {
      fullName,
      email,
      passwordHash,
      age: 25,
      phone: '9876543210',
      highestQualification: 'BACHELORS',
      city: 'Pune',
    },
  });
}

export async function createFinalizedAttempt(options: FinalizedAttemptOptions) {
  if (options.correct + options.incorrect + options.unattempted !== 10) {
    throw new Error('Finalized attempt counts must sum to 10');
  }

  const passPercentage = options.passPercentage ?? 60;
  const netScore = options.correct * 2 - options.incorrect;
  const percentage = Math.round((netScore / 20) * 100);
  const outcome = percentage >= passPercentage ? 'PASS' : 'FAIL';
  const status = options.status ?? 'COMPLETED';
  const startedAt = options.startedAt ?? new Date(Date.now() - 20 * 60_000);
  const expiresAt = new Date(startedAt.getTime() + 15 * 60_000);
  const submittedAt =
    options.submittedAt ??
    (status === 'EXPIRED'
      ? expiresAt
      : new Date(startedAt.getTime() + 10 * 60_000));
  const timeTakenSeconds = Math.max(
    0,
    Math.floor((submittedAt.getTime() - startedAt.getTime()) / 1000),
  );

  const candidate = await createResultCandidate(options.fullName, options.email);
  const attempt = await prisma.testAttempt.create({
    data: {
      candidateId: candidate.id,
      status,
      questionOrder: [],
      questionSnapshots: [],
      totalQuestions: 10,
      startedAt,
      expiresAt,
      submittedAt,
      durationMinutes: 15,
      passPercentage,
      netScore,
      correctCount: options.correct,
      incorrectCount: options.incorrect,
      unattemptedCount: options.unattempted,
      marksDeducted: options.incorrect,
      percentage,
      result: outcome,
      timeTakenSeconds,
    },
  });

  return { candidate, attempt };
}

export async function createInProgressAttempt(options: {
  fullName: string;
  email: string;
}) {
  const candidate = await createResultCandidate(options.fullName, options.email);
  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + 15 * 60_000);
  const attempt = await prisma.testAttempt.create({
    data: {
      candidateId: candidate.id,
      status: 'IN_PROGRESS',
      questionOrder: [],
      questionSnapshots: [],
      totalQuestions: 10,
      startedAt,
      expiresAt,
      durationMinutes: 15,
      passPercentage: 60,
    },
  });
  return { candidate, attempt };
}
