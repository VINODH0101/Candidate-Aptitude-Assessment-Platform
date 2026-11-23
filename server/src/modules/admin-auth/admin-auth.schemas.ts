import { z } from 'zod';

export const adminLoginSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('Enter a valid email address')
      .max(255),
    password: z.string().min(1, 'Password is required').max(128),
  })
  .strict();

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
