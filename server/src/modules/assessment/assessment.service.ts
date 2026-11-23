import { randomInt } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import {
  MAX_ACTIVE_QUESTIONS,
  QUESTION_ACTIVE_LOCK_KEY,
} from '../../config/assessment';
import { getSettings, getSettingsDto } from '../settings/settings.service';
import { getAssessmentReadiness } from '../questions/questions.service';
import {
  CORRECT_MARKS,
  INCORRECT_MARKS,
  UNANSWERED_MARKS,
  gradeAttempt,
} from './grading';
import type {
  AnswerSaveDto,
  AssessmentInstructionsDto,
  AttemptStateDto,
  AttemptWithAnswers,
  CandidateQuestionViewDto,
  CandidateResultDto,
  CandidateResultReviewDto,
  NavigationEntry,
  SnapshotQuestion,
} from './assessment.types';
import type { SaveAnswerInput } from './assessment.schemas';

type Tx = Prisma.TransactionClient;

function parseSnapshots(attempt: AttemptWithAnswers): SnapshotQuestion[] {
  return (attempt.questionSnapshots as unknown as SnapshotQuestion[]) ?? [];
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    const first = result[index];
    const second = result[swapIndex];
    if (first === undefined || second === undefined) continue;
    result[index] = second;
    result[swapIndex] = first;
  }
  return result;
}

async function lockAttemptByCandidate(
  tx: Tx,
  candidateId: string,
): Promise<AttemptWithAnswers | null> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "TestAttempt" WHERE "candidateId" = ${candidateId} FOR UPDATE
  `;
  if (rows.length === 0) return null;
  return tx.testAttempt.findUnique({
    where: { candidateId },
    include: { answers: true },
  });
}

async function lockAttemptById(
  tx: Tx,
  attemptId: string,
): Promise<AttemptWithAnswers | null> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "TestAttempt" WHERE "id" = ${attemptId} FOR UPDATE
  `;
  if (rows.length === 0) return null;
  return tx.testAttempt.findUnique({
    where: { id: attemptId },
    include: { answers: true },
  });
}

async function finalizeLocked(
  tx: Tx,
  attempt: AttemptWithAnswers,
  now: Date,
): Promise<AttemptWithAnswers> {
  if (attempt.status !== 'IN_PROGRESS') return attempt;

  const snapshots = parseSnapshots(attempt);
  const grading = gradeAttempt(snapshots, attempt.answers, attempt.passPercentage);
  const timedOut = now.getTime() >= attempt.expiresAt.getTime();
  const effectiveEnd = timedOut ? attempt.expiresAt : now;
  const timeTakenSeconds = Math.max(
    0,
    Math.floor((effectiveEnd.getTime() - attempt.startedAt.getTime()) / 1000),
  );

  await tx.testAttempt.updateMany({
    where: { id: attempt.id, status: 'IN_PROGRESS' },
    data: {
      status: timedOut ? 'EXPIRED' : 'COMPLETED',
      totalQuestions: grading.totalQuestions,
      correctCount: grading.correctCount,
      incorrectCount: grading.incorrectCount,
      unattemptedCount: grading.unattemptedCount,
      netScore: grading.netScore,
      marksDeducted: grading.marksDeducted,
      percentage: grading.percentage,
      result: grading.passed ? 'PASS' : 'FAIL',
      timeTakenSeconds,
      submittedAt: effectiveEnd,
    },
  });

  const updated = await tx.testAttempt.findUnique({
    where: { id: attempt.id },
    include: { answers: true },
  });
  if (!updated) {
    throw AppError.notFound('Attempt not found', 'ATTEMPT_NOT_FOUND');
  }
  return updated;
}

function toResultDto(attempt: AttemptWithAnswers): CandidateResultDto {
  const snapshots = parseSnapshots(attempt);
  const answerByQuestion = new Map(
    attempt.answers.map((answer) => [answer.questionId, answer]),
  );

  const questions = snapshots.map((snapshot, position) => {
    const answer = answerByQuestion.get(snapshot.questionId);
    const selectedOptionIndex = answer?.selectedOptionIndex ?? null;
    const outcome: 'CORRECT' | 'INCORRECT' | 'UNANSWERED' =
      selectedOptionIndex === null
        ? 'UNANSWERED'
        : selectedOptionIndex === snapshot.correctOptionIndex
          ? 'CORRECT'
          : 'INCORRECT';
    return {
      position,
      number: position + 1,
      questionText: snapshot.questionText,
      options: snapshot.options,
      selectedOptionIndex,
      markedForReview: answer?.markedForReview ?? false,
      outcome,
    };
  });

  const totalQuestions = attempt.totalQuestions || snapshots.length;

  return {
    attemptId: attempt.id,
    status: attempt.status === 'EXPIRED' ? 'EXPIRED' : 'COMPLETED',
    totalQuestions,
    correctCount: attempt.correctCount ?? 0,
    incorrectCount: attempt.incorrectCount ?? 0,
    unattemptedCount: attempt.unattemptedCount ?? 0,
    netScore: attempt.netScore ?? 0,
    marksDeducted: attempt.marksDeducted ?? 0,
    maxScore: totalQuestions * CORRECT_MARKS,
    percentage: attempt.percentage ?? 0,
    passPercentage: attempt.passPercentage,
    passed: attempt.result === 'PASS',
    timeTakenSeconds: attempt.timeTakenSeconds ?? 0,
    startedAt: attempt.startedAt.toISOString(),
    submittedAt: (attempt.submittedAt ?? attempt.expiresAt).toISOString(),
    questions,
  };
}

function buildNavigation(attempt: AttemptWithAnswers): NavigationEntry[] {
  const snapshots = parseSnapshots(attempt);
  const answerByQuestion = new Map(
    attempt.answers.map((answer) => [answer.questionId, answer]),
  );
  return snapshots.map((snapshot, position) => {
    const answer = answerByQuestion.get(snapshot.questionId);
    return {
      position,
      number: position + 1,
      answered: answer?.selectedOptionIndex !== null && answer?.selectedOptionIndex !== undefined,
      markedForReview: answer?.markedForReview ?? false,
    };
  });
}

function toStateDto(attempt: AttemptWithAnswers, now: Date): AttemptStateDto {
  const navigation = buildNavigation(attempt);
  const active = attempt.status === 'IN_PROGRESS';
  const remainingSeconds = active
    ? Math.max(
        0,
        Math.floor((attempt.expiresAt.getTime() - now.getTime()) / 1000),
      )
    : 0;

  return {
    id: attempt.id,
    status: attempt.status,
    totalQuestions: attempt.totalQuestions,
    answeredCount: navigation.filter((entry) => entry.answered).length,
    markedCount: navigation.filter((entry) => entry.markedForReview).length,
    durationMinutes: attempt.durationMinutes,
    passPercentage: attempt.passPercentage,
    startedAt: attempt.startedAt.toISOString(),
    expiresAt: attempt.expiresAt.toISOString(),
    submittedAt: attempt.submittedAt ? attempt.submittedAt.toISOString() : null,
    serverNow: now.toISOString(),
    remainingSeconds,
    canAnswer: active && remainingSeconds > 0,
    navigation,
    result: active ? null : toResultDto(attempt),
  };
}

async function finalizeExpiredByCandidate(
  candidateId: string,
): Promise<AttemptWithAnswers | null> {
  return prisma.$transaction(async (tx) => {
    const attempt = await lockAttemptByCandidate(tx, candidateId);
    if (!attempt) return null;
    const now = new Date();
    if (
      attempt.status === 'IN_PROGRESS' &&
      now.getTime() >= attempt.expiresAt.getTime()
    ) {
      return finalizeLocked(tx, attempt, now);
    }
    return attempt;
  });
}

export async function createAttemptForCandidate(
  candidateId: string,
): Promise<AttemptWithAnswers> {
  const settings = await getSettings();

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(${QUESTION_ACTIVE_LOCK_KEY})`,
      );

      const candidate = await tx.candidate.findUnique({
        where: { id: candidateId },
        select: { id: true },
      });
      if (!candidate) {
        throw AppError.notFound('Candidate not found', 'CANDIDATE_NOT_FOUND');
      }

      const existing = await tx.testAttempt.findUnique({
        where: { candidateId },
        select: { id: true },
      });
      if (existing) {
        throw AppError.conflict(
          'This candidate has already attempted the assessment.',
          'ATTEMPT_EXISTS',
          { attemptId: existing.id },
        );
      }

      const activeQuestions = await tx.question.findMany({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
        take: MAX_ACTIVE_QUESTIONS,
      });
      if (activeQuestions.length < MAX_ACTIVE_QUESTIONS) {
        throw AppError.conflict(
          `An assessment requires ${MAX_ACTIVE_QUESTIONS} active questions. Currently ${activeQuestions.length} are active.`,
          'ASSESSMENT_NOT_READY',
          {
            activeQuestions: activeQuestions.length,
            required: MAX_ACTIVE_QUESTIONS,
          },
        );
      }

      const ordered = shuffle(activeQuestions);
      const now = new Date();
      const expiresAt = new Date(
        now.getTime() + settings.assessmentDurationMinutes * 60 * 1000,
      );
      const snapshots: SnapshotQuestion[] = ordered.map((question) => ({
        questionId: question.id,
        questionText: question.questionText,
        options: question.options,
        correctOptionIndex: question.correctOptionIndex,
        category: question.category,
        difficulty: question.difficulty,
      }));

      return tx.testAttempt.create({
        data: {
          candidateId,
          status: 'IN_PROGRESS',
          questionOrder: ordered.map((question) => question.id),
          questionSnapshots: snapshots as unknown as Prisma.InputJsonValue,
          totalQuestions: ordered.length,
          startedAt: now,
          expiresAt,
          durationMinutes: settings.assessmentDurationMinutes,
          passPercentage: settings.passPercentage,
        },
        include: { answers: true },
      });
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const existing = await prisma.testAttempt.findUnique({
        where: { candidateId },
        select: { id: true },
      });
      throw AppError.conflict(
        'This candidate has already attempted the assessment.',
        'ATTEMPT_EXISTS',
        existing ? { attemptId: existing.id } : undefined,
      );
    }
    throw error;
  }
}

export async function getInstructions(
  candidateId: string,
): Promise<AssessmentInstructionsDto> {
  const [settings, readiness, existing] = await Promise.all([
    getSettingsDto(),
    getAssessmentReadiness(),
    prisma.testAttempt.findUnique({
      where: { candidateId },
      select: { status: true },
    }),
  ]);

  return {
    totalQuestions: MAX_ACTIVE_QUESTIONS,
    activeQuestions: readiness.activeQuestions,
    requiredQuestions: MAX_ACTIVE_QUESTIONS,
    ready: readiness.ready,
    durationMinutes: settings.assessmentDurationMinutes,
    passPercentage: settings.passPercentage,
    correctMarks: CORRECT_MARKS,
    incorrectMarks: INCORRECT_MARKS,
    unansweredMarks: UNANSWERED_MARKS,
    maxScore: MAX_ACTIVE_QUESTIONS * CORRECT_MARKS,
    hasAttempt: Boolean(existing),
    attemptStatus: existing?.status ?? null,
  };
}

export async function startOrResume(
  candidateId: string,
): Promise<{ state: AttemptStateDto; created: boolean }> {
  const existing = await prisma.testAttempt.findUnique({
    where: { candidateId },
    include: { answers: true },
  });

  if (existing) {
    const now = new Date();
    const attempt =
      existing.status === 'IN_PROGRESS' &&
      now.getTime() >= existing.expiresAt.getTime()
        ? (await finalizeExpiredByCandidate(candidateId)) ?? existing
        : existing;
    return { state: toStateDto(attempt, new Date()), created: false };
  }

  try {
    const attempt = await createAttemptForCandidate(candidateId);
    return { state: toStateDto(attempt, new Date()), created: true };
  } catch (error) {
    if (error instanceof AppError && error.code === 'ATTEMPT_EXISTS') {
      const attempt = await finalizeExpiredByCandidate(candidateId);
      if (!attempt) throw error;
      return { state: toStateDto(attempt, new Date()), created: false };
    }
    throw error;
  }
}

export async function getAttemptState(
  candidateId: string,
): Promise<AttemptStateDto> {
  let attempt = await prisma.testAttempt.findUnique({
    where: { candidateId },
    include: { answers: true },
  });
  if (!attempt) {
    throw AppError.notFound('No assessment attempt found', 'ATTEMPT_NOT_FOUND');
  }

  const now = new Date();
  if (
    attempt.status === 'IN_PROGRESS' &&
    now.getTime() >= attempt.expiresAt.getTime()
  ) {
    attempt = (await finalizeExpiredByCandidate(candidateId)) ?? attempt;
  }

  return toStateDto(attempt, new Date());
}

export async function getQuestionView(
  candidateId: string,
  index: number,
): Promise<CandidateQuestionViewDto> {
  let attempt = await prisma.testAttempt.findUnique({
    where: { candidateId },
    include: { answers: true },
  });
  if (!attempt) {
    throw AppError.notFound('No assessment attempt found', 'ATTEMPT_NOT_FOUND');
  }

  const now = new Date();
  if (
    attempt.status === 'IN_PROGRESS' &&
    now.getTime() >= attempt.expiresAt.getTime()
  ) {
    attempt = (await finalizeExpiredByCandidate(candidateId)) ?? attempt;
  }

  if (attempt.status !== 'IN_PROGRESS') {
    throw AppError.conflict(
      'This attempt has been finalized. View your result.',
      'ATTEMPT_FINALIZED',
      { status: attempt.status },
    );
  }

  const snapshots = parseSnapshots(attempt);
  if (index >= snapshots.length) {
    throw AppError.badRequest(
      'Question index is out of range',
      'INVALID_QUESTION_INDEX',
    );
  }
  const snapshot = snapshots[index];
  if (!snapshot) {
    throw AppError.badRequest(
      'Question index is out of range',
      'INVALID_QUESTION_INDEX',
    );
  }

  const answer = attempt.answers.find(
    (entry) => entry.questionId === snapshot.questionId,
  );
  const remainingSeconds = Math.max(
    0,
    Math.floor((attempt.expiresAt.getTime() - now.getTime()) / 1000),
  );

  return {
    position: index,
    number: index + 1,
    total: snapshots.length,
    questionText: snapshot.questionText,
    options: snapshot.options,
    selectedOptionIndex: answer?.selectedOptionIndex ?? null,
    markedForReview: answer?.markedForReview ?? false,
    answered:
      answer?.selectedOptionIndex !== null && answer?.selectedOptionIndex !== undefined,
    hasPrevious: index > 0,
    hasNext: index < snapshots.length - 1,
    status: attempt.status,
    serverNow: now.toISOString(),
    remainingSeconds,
  };
}

type SaveOutcome =
  | { kind: 'saved'; data: AnswerSaveDto }
  | { kind: 'finalized' }
  | { kind: 'expired'; result: CandidateResultDto };

export async function saveAnswer(
  candidateId: string,
  index: number,
  input: SaveAnswerInput,
): Promise<AnswerSaveDto> {
  const outcome: SaveOutcome = await prisma.$transaction(async (tx) => {
    const attempt = await lockAttemptByCandidate(tx, candidateId);
    if (!attempt) {
      throw AppError.notFound('No assessment attempt found', 'ATTEMPT_NOT_FOUND');
    }

    const now = new Date();
    if (attempt.status !== 'IN_PROGRESS') {
      return { kind: 'finalized' };
    }

    if (now.getTime() >= attempt.expiresAt.getTime()) {
      const finalized = await finalizeLocked(tx, attempt, now);
      return { kind: 'expired', result: toResultDto(finalized) };
    }

    const snapshots = parseSnapshots(attempt);
    if (index >= snapshots.length) {
      throw AppError.badRequest(
        'Question index is out of range',
        'INVALID_QUESTION_INDEX',
      );
    }
    const snapshot = snapshots[index];
    if (!snapshot) {
      throw AppError.badRequest(
        'Question index is out of range',
        'INVALID_QUESTION_INDEX',
      );
    }

    if (
      input.selectedOptionIndex !== undefined &&
      input.selectedOptionIndex !== null &&
      input.selectedOptionIndex >= snapshot.options.length
    ) {
      throw AppError.badRequest(
        'Selected option is invalid for this question',
        'INVALID_OPTION',
      );
    }

    await tx.candidateAnswer.upsert({
      where: {
        attemptId_questionId: {
          attemptId: attempt.id,
          questionId: snapshot.questionId,
        },
      },
      create: {
        attemptId: attempt.id,
        questionId: snapshot.questionId,
        selectedOptionIndex: input.selectedOptionIndex ?? null,
        markedForReview: input.markedForReview ?? false,
      },
      update: {
        ...(input.selectedOptionIndex !== undefined
          ? { selectedOptionIndex: input.selectedOptionIndex }
          : {}),
        ...(input.markedForReview !== undefined
          ? { markedForReview: input.markedForReview }
          : {}),
      },
    });

    const answers = await tx.candidateAnswer.findMany({
      where: { attemptId: attempt.id },
    });
    const saved = answers.find(
      (entry) => entry.questionId === snapshot.questionId,
    );

    return {
      kind: 'saved',
      data: {
        position: index,
        number: index + 1,
        selectedOptionIndex: saved?.selectedOptionIndex ?? null,
        markedForReview: saved?.markedForReview ?? false,
        answeredCount: answers.filter(
          (entry) => entry.selectedOptionIndex !== null,
        ).length,
        markedCount: answers.filter((entry) => entry.markedForReview).length,
        remainingSeconds: Math.max(
          0,
          Math.floor((attempt.expiresAt.getTime() - now.getTime()) / 1000),
        ),
        serverNow: now.toISOString(),
      },
    };
  });

  if (outcome.kind === 'finalized') {
    throw AppError.conflict(
      'This attempt has been finalized',
      'ATTEMPT_FINALIZED',
    );
  }
  if (outcome.kind === 'expired') {
    throw AppError.gone('The assessment time has expired', 'ATTEMPT_EXPIRED', {
      result: outcome.result,
    });
  }
  return outcome.data;
}

export async function submitAttempt(
  candidateId: string,
): Promise<CandidateResultDto> {
  return prisma.$transaction(async (tx) => {
    const attempt = await lockAttemptByCandidate(tx, candidateId);
    if (!attempt) {
      throw AppError.notFound('No assessment attempt found', 'ATTEMPT_NOT_FOUND');
    }
    if (attempt.status !== 'IN_PROGRESS') {
      return toResultDto(attempt);
    }
    const finalized = await finalizeLocked(tx, attempt, new Date());
    return toResultDto(finalized);
  });
}

export async function getResult(candidateId: string): Promise<CandidateResultDto> {
  const attempt = await prisma.testAttempt.findUnique({
    where: { candidateId },
    include: { answers: true },
  });
  if (!attempt) {
    throw AppError.notFound('No assessment attempt found', 'ATTEMPT_NOT_FOUND');
  }

  if (attempt.status === 'IN_PROGRESS') {
    const now = new Date();
    if (now.getTime() >= attempt.expiresAt.getTime()) {
      const finalized = await finalizeExpiredByCandidate(candidateId);
      if (!finalized) {
        throw AppError.notFound('No assessment attempt found', 'ATTEMPT_NOT_FOUND');
      }
      return toResultDto(finalized);
    }
    throw AppError.conflict(
      'The assessment has not been submitted yet',
      'ASSESSMENT_NOT_SUBMITTED',
    );
  }

  return toResultDto(attempt);
}

export async function getResultReview(
  candidateId: string,
): Promise<CandidateResultReviewDto> {
  let attempt = await prisma.testAttempt.findUnique({
    where: { candidateId },
    include: { answers: true },
  });
  if (!attempt) {
    throw AppError.notFound('No assessment attempt found', 'ATTEMPT_NOT_FOUND');
  }

  if (attempt.status === 'IN_PROGRESS') {
    const now = new Date();
    if (now.getTime() >= attempt.expiresAt.getTime()) {
      attempt = (await finalizeExpiredByCandidate(candidateId)) ?? attempt;
    } else {
      throw AppError.conflict(
        'The assessment has not been submitted yet',
        'ASSESSMENT_NOT_SUBMITTED',
      );
    }
  }

  const snapshots = parseSnapshots(attempt);
  const answerByQuestion = new Map(
    attempt.answers.map((answer) => [answer.questionId, answer]),
  );

  const questions = snapshots.map((snapshot, position) => {
    const answer = answerByQuestion.get(snapshot.questionId);
    const selectedOptionIndex = answer?.selectedOptionIndex ?? null;
    const outcome: 'CORRECT' | 'INCORRECT' | 'UNANSWERED' =
      selectedOptionIndex === null
        ? 'UNANSWERED'
        : selectedOptionIndex === snapshot.correctOptionIndex
          ? 'CORRECT'
          : 'INCORRECT';
    return {
      position,
      number: position + 1,
      questionText: snapshot.questionText,
      options: snapshot.options,
      selectedOptionIndex,
      selectedAnswer:
        selectedOptionIndex === null
          ? null
          : snapshot.options[selectedOptionIndex] ?? null,
      correctOptionIndex: snapshot.correctOptionIndex,
      correctAnswer: snapshot.options[snapshot.correctOptionIndex] ?? '',
      markedForReview: answer?.markedForReview ?? false,
      outcome,
    };
  });

  const totalQuestions = attempt.totalQuestions || snapshots.length;

  return {
    attemptId: attempt.id,
    status: attempt.status === 'EXPIRED' ? 'EXPIRED' : 'COMPLETED',
    totalQuestions,
    correctCount: attempt.correctCount ?? 0,
    incorrectCount: attempt.incorrectCount ?? 0,
    unattemptedCount: attempt.unattemptedCount ?? 0,
    netScore: attempt.netScore ?? 0,
    marksDeducted: attempt.marksDeducted ?? 0,
    maxScore: totalQuestions * CORRECT_MARKS,
    percentage: attempt.percentage ?? 0,
    passPercentage: attempt.passPercentage,
    passed: attempt.result === 'PASS',
    timeTakenSeconds: attempt.timeTakenSeconds ?? 0,
    startedAt: attempt.startedAt.toISOString(),
    submittedAt: (attempt.submittedAt ?? attempt.expiresAt).toISOString(),
    questions,
  };
}

export async function finalizeExpiredAttempts(limit = 100): Promise<number> {
  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "TestAttempt"
        WHERE "status" = 'IN_PROGRESS' AND "expiresAt" <= now()
        ORDER BY "expiresAt" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      `;

      let finalized = 0;
      for (const row of rows) {
        const attempt = await lockAttemptById(tx, row.id);
        if (!attempt || attempt.status !== 'IN_PROGRESS') continue;
        await finalizeLocked(tx, attempt, new Date());
        finalized += 1;
      }
      return finalized;
    },
    { timeout: 20_000 },
  );
}
