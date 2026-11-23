import { Prisma, type AttemptStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import type { SnapshotQuestion } from '../assessment/assessment.types';
import type {
  AdminResultDetailDto,
  AdminResultItemDto,
  PaginatedResultsDto,
} from './results.dto';
import type { ListResultsQuery, ExportResultsQuery } from './results.schemas';

const FINALIZED_STATUSES: AttemptStatus[] = ['COMPLETED', 'EXPIRED'];

function buildWhere(query: {
  search?: string;
  result?: 'PASS' | 'FAIL';
}): Prisma.TestAttemptWhereInput {
  const where: Prisma.TestAttemptWhereInput = {
    status: { in: FINALIZED_STATUSES },
  };
  if (query.result) {
    where.result = query.result;
  }
  if (query.search) {
    where.candidate = {
      OR: [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ],
    };
  }
  return where;
}

function buildOrderBy(
  sortBy: 'score' | 'attemptDate',
  sortOrder: 'asc' | 'desc',
): Prisma.TestAttemptOrderByWithRelationInput[] {
  return sortBy === 'score'
    ? [{ netScore: sortOrder }, { startedAt: 'desc' }]
    : [{ startedAt: sortOrder }, { id: 'asc' }];
}

function toResultItem(attempt: {
  id: string;
  status: AttemptStatus;
  result: 'PASS' | 'FAIL' | null;
  totalQuestions: number;
  correctCount: number | null;
  incorrectCount: number | null;
  unattemptedCount: number | null;
  netScore: number | null;
  percentage: number | null;
  passPercentage: number;
  marksDeducted: number | null;
  timeTakenSeconds: number | null;
  startedAt: Date;
  submittedAt: Date | null;
  expiresAt: Date;
  candidate: {
    id: string;
    fullName: string;
    email: string;
    phone: string;
    age: number;
  };
}): AdminResultItemDto {
  const totalQuestions = attempt.totalQuestions;
  return {
    attemptId: attempt.id,
    candidate: attempt.candidate,
    status: attempt.status,
    outcome: attempt.result ?? 'FAIL',
    passed: attempt.result === 'PASS',
    totalQuestions,
    correctCount: attempt.correctCount ?? 0,
    incorrectCount: attempt.incorrectCount ?? 0,
    unattemptedCount: attempt.unattemptedCount ?? 0,
    netScore: attempt.netScore ?? 0,
    maxScore: totalQuestions * 2,
    percentage: attempt.percentage ?? 0,
    passPercentage: attempt.passPercentage,
    marksDeducted: attempt.marksDeducted ?? 0,
    timeTakenSeconds: attempt.timeTakenSeconds ?? 0,
    startedAt: attempt.startedAt.toISOString(),
    submittedAt: (attempt.submittedAt ?? attempt.expiresAt).toISOString(),
  };
}

export async function listResults(
  query: ListResultsQuery,
): Promise<PaginatedResultsDto> {
  const finalizedWhere: Prisma.TestAttemptWhereInput = {
    status: { in: FINALIZED_STATUSES },
  };
  const where = buildWhere(query);
  const orderBy = buildOrderBy(query.sortBy, query.sortOrder);

  const skip = (query.page - 1) * query.pageSize;

  const [rows, totalCount, filteredCount] = await prisma.$transaction([
    prisma.testAttempt.findMany({
      where,
      orderBy,
      skip,
      take: query.pageSize,
      include: {
        candidate: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            age: true,
          },
        },
      },
    }),
    prisma.testAttempt.count({ where: finalizedWhere }),
    prisma.testAttempt.count({ where }),
  ]);

  return {
    items: rows.map(toResultItem),
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.ceil(filteredCount / query.pageSize),
    totalCount,
    filteredCount,
  };
}

export async function exportResults(
  query: ExportResultsQuery,
): Promise<AdminResultItemDto[]> {
  const where = buildWhere(query);
  const orderBy = buildOrderBy(query.sortBy, query.sortOrder);

  const rows = await prisma.testAttempt.findMany({
    where,
    orderBy,
    include: {
      candidate: {
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          age: true,
        },
      },
    },
  });

  return rows.map(toResultItem);
}

export async function getResultDetail(
  attemptId: string,
): Promise<AdminResultDetailDto> {
  const attempt = await prisma.testAttempt.findFirst({
    where: { id: attemptId, status: { in: FINALIZED_STATUSES } },
    include: {
      candidate: {
        select: {
          id: true,
          fullName: true,
          email: true,
          age: true,
          phone: true,
          gender: true,
          highestQualification: true,
          city: true,
          createdAt: true,
        },
      },
      answers: true,
    },
  });

  if (!attempt) {
    throw AppError.notFound('Finalized result not found', 'RESULT_NOT_FOUND');
  }

  const snapshots = (attempt.questionSnapshots as unknown as SnapshotQuestion[]) ?? [];
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

  const totalQuestions = attempt.totalQuestions;

  return {
    attemptId: attempt.id,
    candidate: {
      ...attempt.candidate,
      createdAt: attempt.candidate.createdAt.toISOString(),
    },
    status: attempt.status,
    outcome: attempt.result ?? 'FAIL',
    passed: attempt.result === 'PASS',
    totalQuestions,
    correctCount: attempt.correctCount ?? 0,
    incorrectCount: attempt.incorrectCount ?? 0,
    unattemptedCount: attempt.unattemptedCount ?? 0,
    netScore: attempt.netScore ?? 0,
    maxScore: totalQuestions * 2,
    percentage: attempt.percentage ?? 0,
    passPercentage: attempt.passPercentage,
    marksDeducted: attempt.marksDeducted ?? 0,
    timeTakenSeconds: attempt.timeTakenSeconds ?? 0,
    startedAt: attempt.startedAt.toISOString(),
    expiresAt: attempt.expiresAt.toISOString(),
    submittedAt: (attempt.submittedAt ?? attempt.expiresAt).toISOString(),
    questions,
  };
}
