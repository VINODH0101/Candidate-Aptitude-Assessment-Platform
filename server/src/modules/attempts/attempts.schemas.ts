import { z } from 'zod';

export const startAttemptSchema = z
  .object({
    candidateId: z.string().uuid('Invalid candidate id'),
  })
  .strict();

export type StartAttemptInput = z.infer<typeof startAttemptSchema>;
