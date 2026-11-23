import { z } from 'zod';

const CATEGORIES = ['QUANTITATIVE', 'LOGICAL', 'VERBAL'] as const;
const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;

const optionsSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1, 'Option cannot be empty')
      .max(500, 'Option must be at most 500 characters'),
  )
  .length(4, 'Exactly four options are required');

const baseQuestionShape = {
  questionText: z
    .string()
    .trim()
    .min(5, 'Question text must be at least 5 characters')
    .max(2000, 'Question text must be at most 2000 characters'),
  options: optionsSchema,
  correctOptionIndex: z
    .number()
    .int('Correct option must be a whole number')
    .min(0, 'Correct option must be between 0 and 3')
    .max(3, 'Correct option must be between 0 and 3'),
  category: z.enum(CATEGORIES, {
    errorMap: () => ({ message: 'Select a valid category' }),
  }),
  difficulty: z.enum(DIFFICULTIES, {
    errorMap: () => ({ message: 'Select a valid difficulty' }),
  }),
};

function distinctOptions(
  options: string[],
  context: z.RefinementCtx,
): void {
  const normalized = options.map((option) => option.toLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['options'],
      message: 'Options must be distinct',
    });
  }
}

export const createQuestionSchema = z
  .object({
    ...baseQuestionShape,
    isActive: z.boolean().optional().default(false),
  })
  .strict()
  .superRefine((data, context) => distinctOptions(data.options, context));

export const updateQuestionSchema = z
  .object(baseQuestionShape)
  .strict()
  .superRefine((data, context) => distinctOptions(data.options, context));

export const questionStatusSchema = z
  .object({
    isActive: z.boolean(),
  })
  .strict();

export const questionIdParamSchema = z.object({
  id: z.string().uuid('Invalid question id'),
});

export const listQuestionsQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  category: z.enum(CATEGORIES).optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;
export type ListQuestionsQuery = z.infer<typeof listQuestionsQuerySchema>;
