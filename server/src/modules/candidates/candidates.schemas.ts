import { z } from 'zod';

export const GENDERS = ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'] as const;
export const QUALIFICATIONS = [
  'HIGH_SCHOOL',
  'DIPLOMA',
  'BACHELORS',
  'MASTERS',
  'DOCTORATE',
  'OTHER',
] as const;

export const registerCandidateSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, 'Name must be at least 2 characters')
      .max(50, 'Name must be at most 50 characters')
      .regex(/^[A-Za-z]+(?: [A-Za-z]+)*$/, 'Name may contain letters and spaces only'),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('Enter a valid email address')
      .max(255, 'Email is too long'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password must be at most 128 characters'),
    age: z
      .number()
      .int('Age must be a whole number')
      .min(18, 'Age must be at least 18')
      .max(60, 'Age must be at most 60'),
    phone: z
      .string()
      .trim()
      .regex(/^\d{10}$/, 'Phone must be exactly 10 digits'),
    gender: z.enum(GENDERS).optional(),
    highestQualification: z.enum(QUALIFICATIONS, {
      errorMap: () => ({ message: 'Select a valid qualification' }),
    }),
    city: z.string().trim().max(100, 'City must be at most 100 characters').optional(),
  })
  .strict();

export const candidateLoginSchema = z
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

export type RegisterCandidateInput = z.infer<typeof registerCandidateSchema>;
export type CandidateLoginInput = z.infer<typeof candidateLoginSchema>;
