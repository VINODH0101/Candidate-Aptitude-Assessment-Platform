import type {
  AttemptStatus,
  CandidateAnswer,
  TestAttempt,
} from '@prisma/client';

export interface SnapshotQuestion {
  questionId: string;
  questionText: string;
  options: string[];
  correctOptionIndex: number;
  category: string;
  difficulty: string;
}

export type AttemptWithAnswers = TestAttempt & { answers: CandidateAnswer[] };

export interface NavigationEntry {
  position: number;
  number: number;
  answered: boolean;
  markedForReview: boolean;
}

export interface CandidateResultQuestionDto {
  position: number;
  number: number;
  questionText: string;
  options: string[];
  selectedOptionIndex: number | null;
  markedForReview: boolean;
  outcome: 'CORRECT' | 'INCORRECT' | 'UNANSWERED';
}

export interface CandidateResultDto {
  attemptId: string;
  status: 'COMPLETED' | 'EXPIRED';
  totalQuestions: number;
  correctCount: number;
  incorrectCount: number;
  unattemptedCount: number;
  netScore: number;
  marksDeducted: number;
  maxScore: number;
  percentage: number;
  passPercentage: number;
  passed: boolean;
  timeTakenSeconds: number;
  startedAt: string;
  submittedAt: string;
  questions: CandidateResultQuestionDto[];
}

export interface CandidateResultReviewQuestionDto {
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

export interface CandidateResultReviewDto {
  attemptId: string;
  status: 'COMPLETED' | 'EXPIRED';
  totalQuestions: number;
  correctCount: number;
  incorrectCount: number;
  unattemptedCount: number;
  netScore: number;
  marksDeducted: number;
  maxScore: number;
  percentage: number;
  passPercentage: number;
  passed: boolean;
  timeTakenSeconds: number;
  startedAt: string;
  submittedAt: string;
  questions: CandidateResultReviewQuestionDto[];
}

export interface AttemptStateDto {
  id: string;
  status: AttemptStatus;
  totalQuestions: number;
  answeredCount: number;
  markedCount: number;
  durationMinutes: number;
  passPercentage: number;
  startedAt: string;
  expiresAt: string;
  submittedAt: string | null;
  serverNow: string;
  remainingSeconds: number;
  canAnswer: boolean;
  navigation: NavigationEntry[];
  result: CandidateResultDto | null;
}

export interface CandidateQuestionViewDto {
  position: number;
  number: number;
  total: number;
  questionText: string;
  options: string[];
  selectedOptionIndex: number | null;
  markedForReview: boolean;
  answered: boolean;
  hasPrevious: boolean;
  hasNext: boolean;
  status: AttemptStatus;
  serverNow: string;
  remainingSeconds: number;
}

export interface AnswerSaveDto {
  position: number;
  number: number;
  selectedOptionIndex: number | null;
  markedForReview: boolean;
  answeredCount: number;
  markedCount: number;
  remainingSeconds: number;
  serverNow: string;
}

export interface AssessmentInstructionsDto {
  totalQuestions: number;
  activeQuestions: number;
  requiredQuestions: number;
  ready: boolean;
  durationMinutes: number;
  passPercentage: number;
  correctMarks: number;
  incorrectMarks: number;
  unansweredMarks: number;
  maxScore: number;
  hasAttempt: boolean;
  attemptStatus: AttemptStatus | null;
}
