import { z } from 'zod';

export const listResultsQuerySchema = z
  .object({
    page: z.coerce
      .number()
      .int('Page must be a whole number')
      .min(1, 'Page must be at least 1')
      .default(1),
    pageSize: z.coerce
      .number()
      .int('Page size must be a whole number')
      .min(1, 'Page size must be at least 1')
      .max(100, 'Page size must be at most 100')
      .default(10),
    search: z.string().trim().max(200, 'Search is too long').optional(),
    result: z.enum(['PASS', 'FAIL']).optional(),
    sortBy: z.enum(['score', 'attemptDate']).default('attemptDate'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict();

export const resultAttemptParamSchema = z.object({
  attemptId: z.string().uuid('Invalid attempt id'),
});

export const exportResultsQuerySchema = z
  .object({
    search: z.string().trim().max(200, 'Search is too long').optional(),
    result: z.enum(['PASS', 'FAIL']).optional(),
    sortBy: z.enum(['score', 'attemptDate']).default('attemptDate'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict();

export type ListResultsQuery = z.infer<typeof listResultsQuerySchema>;
export type ExportResultsQuery = z.infer<typeof exportResultsQuerySchema>;
