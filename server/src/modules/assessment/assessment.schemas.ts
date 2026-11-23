import { z } from 'zod';

export const questionIndexParamSchema = z.object({
  index: z.coerce
    .number()
    .int('Question index must be a whole number')
    .min(0, 'Question index must be zero or greater'),
});

export const saveAnswerSchema = z
  .object({
    selectedOptionIndex: z
      .number()
      .int('Selected option must be a whole number')
      .min(0, 'Selected option must be between 0 and 3')
      .max(3, 'Selected option must be between 0 and 3')
      .nullable()
      .optional(),
    markedForReview: z.boolean().optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.selectedOptionIndex !== undefined || data.markedForReview !== undefined,
    {
      message: 'Provide an answer or a review state',
      path: ['selectedOptionIndex'],
    },
  );

export type SaveAnswerInput = z.infer<typeof saveAnswerSchema>;
export type QuestionIndexParams = z.infer<typeof questionIndexParamSchema>;
