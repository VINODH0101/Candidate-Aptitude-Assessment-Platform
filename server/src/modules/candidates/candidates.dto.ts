import type { Candidate, Gender, Qualification } from '@prisma/client';

export interface CandidateDto {
  id: string;
  fullName: string;
  email: string;
  age: number;
  phone: string;
  gender: Gender | null;
  highestQualification: Qualification;
  city: string | null;
  createdAt: string;
}

export function toCandidateDto(candidate: Candidate): CandidateDto {
  return {
    id: candidate.id,
    fullName: candidate.fullName,
    email: candidate.email,
    age: candidate.age,
    phone: candidate.phone,
    gender: candidate.gender,
    highestQualification: candidate.highestQualification,
    city: candidate.city,
    createdAt: candidate.createdAt.toISOString(),
  };
}
