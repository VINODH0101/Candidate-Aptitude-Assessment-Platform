import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import {
  MAX_ACTIVE_QUESTIONS,
  QUESTION_ACTIVE_LOCK_KEY,
} from '../../config/assessment';
import {
  toQuestionDto,
  type QuestionDto,
  type QuestionListDto,
} from './questions.dto';
import type {
  CreateQuestionInput,
  ListQuestionsQuery,
  UpdateQuestionInput,
} from './questions.schemas';

type Tx = Prisma.TransactionClient;

export interface AssessmentReadiness {
  ready: boolean;
  activeQuestions: number;
  required: number;
}

async function lockQuestionActivation(tx: Tx): Promise<void> {
  await tx.$executeRawUnsafe(
    `SELECT pg_advisory_xact_lock(${QUESTION_ACTIVE_LOCK_KEY})`,
  );
}

async function assertCanActivate(tx: Tx, excludeId?: string): Promise<void> {
  await lockQuestionActivation(tx);
  const activeCount = await tx.question.count({
    where: {
      isActive: true,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  if (activeCount >= MAX_ACTIVE_QUESTIONS) {
    throw AppError.conflict(
      `The maximum of ${MAX_ACTIVE_QUESTIONS} active questions has been reached.`,
      'MAX_ACTIVE_QUESTIONS_REACHED',
      { maxActiveQuestions: MAX_ACTIVE_QUESTIONS },
    );
  }
}

async function assertUniqueText(
  tx: Tx,
  questionText: string,
  excludeId?: string,
): Promise<void> {
  const existing = await tx.question.findFirst({
    where: {
      questionText,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (existing) {
    throw AppError.conflict(
      'A question with this text already exists.',
      'QUESTION_EXISTS',
      { questionText: 'A question with this text already exists.' },
    );
  }
}

function mapQuestionError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      throw AppError.conflict(
        'A question with this text already exists.',
        'QUESTION_EXISTS',
        { questionText: 'A question with this text already exists.' },
      );
    }
    if (error.code === 'P2003') {
      throw AppError.conflict(
        'This question is referenced by existing records and cannot be deleted.',
        'QUESTION_IN_USE',
      );
    }
    if (error.code === 'P2025') {
      throw AppError.notFound('Question not found', 'QUESTION_NOT_FOUND');
    }
  }
  if (error instanceof Error && error.message.includes('MAX_ACTIVE_QUESTIONS_EXCEEDED')) {
    throw AppError.conflict(
      `The maximum of ${MAX_ACTIVE_QUESTIONS} active questions has been reached.`,
      'MAX_ACTIVE_QUESTIONS_REACHED',
      { maxActiveQuestions: MAX_ACTIVE_QUESTIONS },
    );
  }
  throw error;
}

export async function listQuestions(
  query: ListQuestionsQuery,
): Promise<QuestionListDto> {
  const where: Prisma.QuestionWhereInput = {};
  if (query.search) {
    where.questionText = { contains: query.search, mode: 'insensitive' };
  }
  if (query.category) where.category = query.category;
  if (query.difficulty) where.difficulty = query.difficulty;
  if (query.isActive !== undefined) where.isActive = query.isActive;

  const skip = (query.page - 1) * query.pageSize;

  const [items, total, activeCount] = await prisma.$transaction([
    prisma.question.findMany({
      where,
      skip,
      take: query.pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.question.count({ where }),
    prisma.question.count({ where: { isActive: true } }),
  ]);

  return {
    items: items.map(toQuestionDto),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.ceil(total / query.pageSize),
    activeCount,
    maxActiveQuestions: MAX_ACTIVE_QUESTIONS,
  };
}

export async function getQuestion(id: string): Promise<QuestionDto> {
  const question = await prisma.question.findUnique({ where: { id } });
  if (!question) {
    throw AppError.notFound('Question not found', 'QUESTION_NOT_FOUND');
  }
  return toQuestionDto(question);
}

export async function createQuestion(
  input: CreateQuestionInput,
): Promise<QuestionDto> {
  try {
    const question = await prisma.$transaction(async (tx) => {
      if (input.isActive) {
        await assertCanActivate(tx);
      }
      await assertUniqueText(tx, input.questionText);
      return tx.question.create({
        data: {
          questionText: input.questionText,
          options: input.options,
          correctOptionIndex: input.correctOptionIndex,
          category: input.category,
          difficulty: input.difficulty,
          isActive: input.isActive,
        },
      });
    });
    return toQuestionDto(question);
  } catch (error) {
    return mapQuestionError(error);
  }
}

export async function updateQuestion(
  id: string,
  input: UpdateQuestionInput,
): Promise<QuestionDto> {
  try {
    const question = await prisma.$transaction(async (tx) => {
      const existing = await tx.question.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!existing) {
        throw AppError.notFound('Question not found', 'QUESTION_NOT_FOUND');
      }
      await assertUniqueText(tx, input.questionText, id);
      return tx.question.update({
        where: { id },
        data: {
          questionText: input.questionText,
          options: input.options,
          correctOptionIndex: input.correctOptionIndex,
          category: input.category,
          difficulty: input.difficulty,
        },
      });
    });
    return toQuestionDto(question);
  } catch (error) {
    return mapQuestionError(error);
  }
}

export async function setQuestionStatus(
  id: string,
  isActive: boolean,
): Promise<QuestionDto> {
  try {
    const question = await prisma.$transaction(async (tx) => {
      const existing = await tx.question.findUnique({
        where: { id },
        select: { id: true, isActive: true },
      });
      if (!existing) {
        throw AppError.notFound('Question not found', 'QUESTION_NOT_FOUND');
      }
      if (isActive && !existing.isActive) {
        await assertCanActivate(tx, id);
      }
      return tx.question.update({ where: { id }, data: { isActive } });
    });
    return toQuestionDto(question);
  } catch (error) {
    return mapQuestionError(error);
  }
}

export async function deleteQuestion(id: string): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      await lockQuestionActivation(tx);
      const existing = await tx.question.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!existing) {
        throw AppError.notFound('Question not found', 'QUESTION_NOT_FOUND');
      }

      const [answerRefs, attemptRefs] = await Promise.all([
        tx.candidateAnswer.count({ where: { questionId: id } }),
        tx.testAttempt.count({ where: { questionOrder: { has: id } } }),
      ]);

      if (answerRefs > 0 || attemptRefs > 0) {
        throw AppError.conflict(
          'This question is referenced by existing attempts and cannot be deleted. Deactivate it instead.',
          'QUESTION_IN_USE',
          { answerReferences: answerRefs, attemptReferences: attemptRefs },
        );
      }

      await tx.question.delete({ where: { id } });
    });
  } catch (error) {
    return mapQuestionError(error);
  }
}

export async function getAssessmentReadiness(): Promise<AssessmentReadiness> {
  const activeQuestions = await prisma.question.count({ where: { isActive: true } });
  return {
    ready: activeQuestions >= MAX_ACTIVE_QUESTIONS,
    activeQuestions,
    required: MAX_ACTIVE_QUESTIONS,
  };
}

export async function assertAssessmentCanStart(): Promise<void> {
  const readiness = await getAssessmentReadiness();
  if (!readiness.ready) {
    throw AppError.conflict(
      `An assessment requires ${MAX_ACTIVE_QUESTIONS} active questions. Currently ${readiness.activeQuestions} are active.`,
      'ASSESSMENT_NOT_READY',
      readiness,
    );
  }
}
