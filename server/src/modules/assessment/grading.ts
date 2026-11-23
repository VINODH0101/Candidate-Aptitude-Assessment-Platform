import type { CandidateAnswer } from '@prisma/client';
import type { SnapshotQuestion } from './assessment.types';

export const CORRECT_MARKS = 2;
export const INCORRECT_MARKS = -1;
export const UNANSWERED_MARKS = 0;

export interface GradeResult {
  totalQuestions: number;
  correctCount: number;
  incorrectCount: number;
  unattemptedCount: number;
  netScore: number;
  marksDeducted: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
}

export function gradeAttempt(
  snapshots: SnapshotQuestion[],
  answers: CandidateAnswer[],
  passPercentage: number,
): GradeResult {
  const answerByQuestion = new Map(
    answers.map((answer) => [answer.questionId, answer]),
  );

  let correctCount = 0;
  let incorrectCount = 0;
  let unattemptedCount = 0;

  for (const snapshot of snapshots) {
    const answer = answerByQuestion.get(snapshot.questionId);
    if (!answer || answer.selectedOptionIndex === null) {
      unattemptedCount += 1;
      continue;
    }
    if (answer.selectedOptionIndex === snapshot.correctOptionIndex) {
      correctCount += 1;
    } else {
      incorrectCount += 1;
    }
  }

  const totalQuestions = snapshots.length;
  const maxScore = totalQuestions * CORRECT_MARKS;
  const netScore = correctCount * CORRECT_MARKS + incorrectCount * INCORRECT_MARKS;
  const marksDeducted = incorrectCount * Math.abs(INCORRECT_MARKS);
  const percentage = maxScore > 0 ? Math.round((netScore / maxScore) * 100) : 0;

  return {
    totalQuestions,
    correctCount,
    incorrectCount,
    unattemptedCount,
    netScore,
    marksDeducted,
    maxScore,
    percentage,
    passed: percentage >= passPercentage,
  };
}
