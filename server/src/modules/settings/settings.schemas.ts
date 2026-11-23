import { z } from 'zod';
import {
  MAX_ASSESSMENT_DURATION_MINUTES,
  MAX_PASS_PERCENTAGE,
  MIN_ASSESSMENT_DURATION_MINUTES,
  MIN_PASS_PERCENTAGE,
} from '../../config/assessment';

export const updateSettingsSchema = z
  .object({
    assessmentDurationMinutes: z
      .number()
      .int('Duration must be a whole number')
      .min(
        MIN_ASSESSMENT_DURATION_MINUTES,
        `Duration must be at least ${MIN_ASSESSMENT_DURATION_MINUTES} minutes`,
      )
      .max(
        MAX_ASSESSMENT_DURATION_MINUTES,
        `Duration must be at most ${MAX_ASSESSMENT_DURATION_MINUTES} minutes`,
      ),
    passPercentage: z
      .number()
      .int('Pass percentage must be a whole number')
      .min(MIN_PASS_PERCENTAGE, `Pass percentage must be at least ${MIN_PASS_PERCENTAGE}`)
      .max(MAX_PASS_PERCENTAGE, `Pass percentage must be at most ${MAX_PASS_PERCENTAGE}`),
  })
  .strict();

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
