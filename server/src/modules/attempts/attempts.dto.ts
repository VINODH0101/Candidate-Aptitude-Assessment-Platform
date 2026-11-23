import type { AttemptStatus, TestAttempt } from '@prisma/client';

export interface TestAttemptDto {
  id: string;
  candidateId: string;
  status: AttemptStatus;
  durationMinutes: number;
  passPercentage: number;
  startedAt: string;
  expiresAt: string;
  questionCount: number;
}

export function toTestAttemptDto(attempt: TestAttempt): TestAttemptDto {
  return {
    id: attempt.id,
    candidateId: attempt.candidateId,
    status: attempt.status,
    durationMinutes: attempt.durationMinutes,
    passPercentage: attempt.passPercentage,
    startedAt: attempt.startedAt.toISOString(),
    expiresAt: attempt.expiresAt.toISOString(),
    questionCount: attempt.questionOrder.length,
  };
}
