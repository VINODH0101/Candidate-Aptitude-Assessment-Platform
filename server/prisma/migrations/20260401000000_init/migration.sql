-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "Category" AS ENUM ('QUANTITATIVE', 'LOGICAL', 'VERBAL');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AttemptResult" AS ENUM ('PASS', 'FAIL');

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "age" INTEGER,
    "phone" TEXT,
    "gender" "Gender",
    "highestQualification" TEXT,
    "city" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "options" TEXT[],
    "correctOptionIndex" INTEGER NOT NULL,
    "category" "Category" NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestAttempt" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "questionOrder" TEXT[],
    "questionSnapshots" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "durationMinutes" INTEGER NOT NULL,
    "passPercentage" INTEGER NOT NULL,
    "netScore" INTEGER,
    "correctCount" INTEGER,
    "incorrectCount" INTEGER,
    "unattemptedCount" INTEGER,
    "percentage" INTEGER,
    "result" "AttemptResult",
    "timeTakenSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateAnswer" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedOptionIndex" INTEGER,
    "markedForReview" BOOLEAN NOT NULL DEFAULT false,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "assessmentDurationMinutes" INTEGER NOT NULL DEFAULT 20,
    "passPercentage" INTEGER NOT NULL DEFAULT 60,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_email_key" ON "Candidate"("email");

-- CreateIndex
CREATE INDEX "Candidate_email_idx" ON "Candidate"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Question_questionText_key" ON "Question"("questionText");

-- CreateIndex
CREATE INDEX "Question_isActive_idx" ON "Question"("isActive");

-- CreateIndex
CREATE INDEX "Question_category_idx" ON "Question"("category");

-- CreateIndex
CREATE INDEX "Question_difficulty_idx" ON "Question"("difficulty");

-- CreateIndex
CREATE UNIQUE INDEX "TestAttempt_candidateId_key" ON "TestAttempt"("candidateId");

-- CreateIndex
CREATE INDEX "TestAttempt_status_idx" ON "TestAttempt"("status");

-- CreateIndex
CREATE INDEX "TestAttempt_createdAt_idx" ON "TestAttempt"("createdAt");

-- CreateIndex
CREATE INDEX "CandidateAnswer_attemptId_idx" ON "CandidateAnswer"("attemptId");

-- CreateIndex
CREATE INDEX "CandidateAnswer_questionId_idx" ON "CandidateAnswer"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateAnswer_attemptId_questionId_key" ON "CandidateAnswer"("attemptId", "questionId");

-- AddForeignKey
ALTER TABLE "TestAttempt" ADD CONSTRAINT "TestAttempt_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateAnswer" ADD CONSTRAINT "CandidateAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "TestAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateAnswer" ADD CONSTRAINT "CandidateAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ===========================================================================
-- Database-level constraints (beyond Prisma's type system)
-- ===========================================================================

-- Normalized, trimmed emails (identity keys must be canonical).
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_email_normalized"
  CHECK ("email" = lower(btrim("email")));
ALTER TABLE "Admin" ADD CONSTRAINT "Admin_email_normalized"
  CHECK ("email" = lower(btrim("email")));

-- Every question has exactly four options and one valid correct index.
ALTER TABLE "Question" ADD CONSTRAINT "Question_options_four"
  CHECK (cardinality("options") = 4);
ALTER TABLE "Question" ADD CONSTRAINT "Question_correct_index_range"
  CHECK ("correctOptionIndex" >= 0 AND "correctOptionIndex" <= 3);

-- Attempt timing and scoring invariants.
ALTER TABLE "TestAttempt" ADD CONSTRAINT "TestAttempt_expiry_after_start"
  CHECK ("expiresAt" > "startedAt");
ALTER TABLE "TestAttempt" ADD CONSTRAINT "TestAttempt_duration_positive"
  CHECK ("durationMinutes" > 0);
ALTER TABLE "TestAttempt" ADD CONSTRAINT "TestAttempt_pass_percentage_range"
  CHECK ("passPercentage" >= 0 AND "passPercentage" <= 100);
ALTER TABLE "TestAttempt" ADD CONSTRAINT "TestAttempt_counts_nonnegative"
  CHECK (
    ("correctCount" IS NULL OR "correctCount" >= 0) AND
    ("incorrectCount" IS NULL OR "incorrectCount" >= 0) AND
    ("unattemptedCount" IS NULL OR "unattemptedCount" >= 0)
  );
ALTER TABLE "TestAttempt" ADD CONSTRAINT "TestAttempt_percentage_range"
  CHECK ("percentage" IS NULL OR ("percentage" >= 0 AND "percentage" <= 100));
ALTER TABLE "TestAttempt" ADD CONSTRAINT "TestAttempt_terminal_fields"
  CHECK (
    "status" = 'IN_PROGRESS' OR (
      "submittedAt" IS NOT NULL AND
      "netScore" IS NOT NULL AND
      "correctCount" IS NOT NULL AND
      "incorrectCount" IS NOT NULL AND
      "unattemptedCount" IS NOT NULL AND
      "percentage" IS NOT NULL AND
      "result" IS NOT NULL AND
      "timeTakenSeconds" IS NOT NULL
    )
  );

-- Selected option index (nullable = unanswered) must be 0..3.
ALTER TABLE "CandidateAnswer" ADD CONSTRAINT "CandidateAnswer_option_range"
  CHECK ("selectedOptionIndex" IS NULL OR ("selectedOptionIndex" >= 0 AND "selectedOptionIndex" <= 3));

-- AppSetting is a singleton row.
ALTER TABLE "AppSetting" ADD CONSTRAINT "AppSetting_singleton"
  CHECK ("id" = 1);
