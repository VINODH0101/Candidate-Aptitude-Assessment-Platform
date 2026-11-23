import type {
  AttemptResult,
  AttemptStatus,
  Gender,
  Qualification,
} from '@prisma/client';

export interface AdminResultCandidateRef {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  age: number;
}

export interface AdminResultItemDto {
  attemptId: string;
  candidate: AdminResultCandidateRef;
  status: AttemptStatus;
  outcome: AttemptResult;
  passed: boolean;
  totalQuestions: number;
  correctCount: number;
  incorrectCount: number;
  unattemptedCount: number;
  netScore: number;
  maxScore: number;
  percentage: number;
  passPercentage: number;
  marksDeducted: number;
  timeTakenSeconds: number;
  startedAt: string;
  submittedAt: string;
}

export interface PaginatedResultsDto {
  items: AdminResultItemDto[];
  page: number;
  pageSize: number;
  totalPages: number;
  totalCount: number;
  filteredCount: number;
}

export interface AdminResultDetailCandidateDto {
  id: string;
  fullName: string;
  email: string;
  age: number;
  phone: string;
  gender: Gender | null;
  highestQualification: Qualification;
  city: string | null;
  createdAt: string;
}

export interface AdminResultDetailQuestionDto {
  position: number;
  number: number;
  questionText: string;
  options: string[];
  selectedOptionIndex: number | null;
  selectedAnswer: string | null;
  correctOptionIndex: number;
  correctAnswer: string;
  markedForReview: boolean;
  outcome: 'CORRECT' | 'INCORRECT' | 'UNANSWERED';
}

export interface AdminResultDetailDto {
  attemptId: string;
  candidate: AdminResultDetailCandidateDto;
  status: AttemptStatus;
  outcome: AttemptResult;
  passed: boolean;
  totalQuestions: number;
  correctCount: number;
  incorrectCount: number;
  unattemptedCount: number;
  netScore: number;
  maxScore: number;
  percentage: number;
  passPercentage: number;
  marksDeducted: number;
  timeTakenSeconds: number;
  startedAt: string;
  expiresAt: string;
  submittedAt: string;
  questions: AdminResultDetailQuestionDto[];
}
