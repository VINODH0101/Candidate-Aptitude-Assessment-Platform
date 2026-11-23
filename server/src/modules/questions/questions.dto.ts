import type { Category, Difficulty, Question } from '@prisma/client';
import { MAX_ACTIVE_QUESTIONS } from '../../config/assessment';

export interface QuestionDto {
  id: string;
  questionText: string;
  options: string[];
  correctOptionIndex: number;
  category: Category;
  difficulty: Difficulty;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionListDto {
  items: QuestionDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  activeCount: number;
  maxActiveQuestions: number;
}

export function toQuestionDto(question: Question): QuestionDto {
  return {
    id: question.id,
    questionText: question.questionText,
    options: question.options,
    correctOptionIndex: question.correctOptionIndex,
    category: question.category,
    difficulty: question.difficulty,
    isActive: question.isActive,
    createdAt: question.createdAt.toISOString(),
    updatedAt: question.updatedAt.toISOString(),
  };
}

export { MAX_ACTIVE_QUESTIONS };
