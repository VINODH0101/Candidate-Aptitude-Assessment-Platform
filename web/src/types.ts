export type Gender = 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY';

export type Qualification =
  | 'HIGH_SCHOOL'
  | 'DIPLOMA'
  | 'BACHELORS'
  | 'MASTERS'
  | 'DOCTORATE'
  | 'OTHER';

export interface AdminProfile {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface CandidateProfile {
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

export interface AdminOverview {
  candidates: number;
  questions: number;
  activeQuestions: number;
  attempts: number;
  admins: number;
}

export type Category = 'QUANTITATIVE' | 'LOGICAL' | 'VERBAL';
export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

export interface Question {
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

export interface QuestionListResponse {
  items: Question[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  activeCount: number;
  maxActiveQuestions: number;
}

export interface AssessmentReadiness {
  ready: boolean;
  activeQuestions: number;
  required: number;
}

export interface AppSettings {
  id: number;
  assessmentDurationMinutes: number;
  passPercentage: number;
  updatedAt: string;
}

export type AttemptStatus = 'IN_PROGRESS' | 'COMPLETED' | 'EXPIRED';

export interface AssessmentInstructions {
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

export interface NavigationEntry {
  position: number;
  number: number;
  answered: boolean;
  markedForReview: boolean;
}

export interface ResultQuestion {
  position: number;
  number: number;
  questionText: string;
  options: string[];
  selectedOptionIndex: number | null;
  markedForReview: boolean;
  outcome: 'CORRECT' | 'INCORRECT' | 'UNANSWERED';
}

export interface CandidateResult {
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
  questions: ResultQuestion[];
}

export interface AttemptState {
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
  result: CandidateResult | null;
}

export interface QuestionView {
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

export interface AnswerSaveResult {
  position: number;
  number: number;
  selectedOptionIndex: number | null;
  markedForReview: boolean;
  answeredCount: number;
  markedCount: number;
  remainingSeconds: number;
  serverNow: string;
}

export interface CandidateResultWithName extends CandidateResult {
  candidateName: string;
}

export interface ReviewQuestion {
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

export interface CandidateResultReview {
  attemptId: string;
  candidateName: string;
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
  questions: ReviewQuestion[];
}


export interface AdminResultCandidateRef {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  age: number;
}

export interface AdminResultItem {
  attemptId: string;
  candidate: AdminResultCandidateRef;
  status: AttemptStatus;
  outcome: 'PASS' | 'FAIL';
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

export interface PaginatedResults {
  items: AdminResultItem[];
  page: number;
  pageSize: number;
  totalPages: number;
  totalCount: number;
  filteredCount: number;
}

export interface AdminResultDetailQuestion {
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

export interface AdminResultDetail {
  attemptId: string;
  candidate: {
    id: string;
    fullName: string;
    email: string;
    age: number;
    phone: string;
    gender: Gender | null;
    highestQualification: Qualification;
    city: string | null;
    createdAt: string;
  };
  status: AttemptStatus;
  outcome: 'PASS' | 'FAIL';
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
  questions: AdminResultDetailQuestion[];
}

export interface DashboardAnalytics {
  totals: {
    candidatesRegistered: number;
    completedAssessments: number;
    expiredAssessments: number;
    finalizedAssessments: number;
    inProgressAttempts: number;
  };
  performance: {
    averageNetScore: number;
    averagePercentage: number;
    highestNetScore: number;
    highestPercentage: number;
    passRate: number;
    passedCount: number;
    failedCount: number;
  };
  passFailDistribution: Array<{ result: 'PASS' | 'FAIL'; count: number }>;
  scoreDistribution: Array<{ bucket: string; count: number }>;
}
