import { createAttemptForCandidate } from '../assessment/assessment.service';
import { toTestAttemptDto, type TestAttemptDto } from './attempts.dto';

export async function startTestAttempt(candidateId: string): Promise<TestAttemptDto> {
  const attempt = await createAttemptForCandidate(candidateId);
  return toTestAttemptDto(attempt);
}
