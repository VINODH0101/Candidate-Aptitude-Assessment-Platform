-- Candidate credentials for authenticated assessment access.
ALTER TABLE "Candidate" ADD COLUMN "passwordHash" TEXT;
UPDATE "Candidate" SET "passwordHash" = '' WHERE "passwordHash" IS NULL;
ALTER TABLE "Candidate" ALTER COLUMN "passwordHash" SET NOT NULL;

-- Assessment engine fields and expiration index.
ALTER TABLE "TestAttempt" ADD COLUMN "totalQuestions" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "TestAttempt" ADD COLUMN "marksDeducted" INTEGER;
CREATE INDEX "TestAttempt_status_expiresAt_idx" ON "TestAttempt"("status", "expiresAt");

-- Negative net scores are valid, so percentages may be negative.
ALTER TABLE "TestAttempt" DROP CONSTRAINT IF EXISTS "TestAttempt_percentage_range";
ALTER TABLE "TestAttempt" ADD CONSTRAINT "TestAttempt_percentage_range"
  CHECK ("percentage" IS NULL OR ("percentage" >= -100 AND "percentage" <= 100));

-- Finalized counts must account for every snapshot question.
ALTER TABLE "TestAttempt" ADD CONSTRAINT "TestAttempt_counts_sum"
  CHECK (
    "status" = 'IN_PROGRESS' OR (
      "correctCount" IS NOT NULL AND
      "incorrectCount" IS NOT NULL AND
      "unattemptedCount" IS NOT NULL AND
      ("correctCount" + "incorrectCount" + "unattemptedCount") = "totalQuestions"
    )
  );

-- Net score = correct*2 - incorrect*1.
ALTER TABLE "TestAttempt" ADD CONSTRAINT "TestAttempt_net_score"
  CHECK (
    "netScore" IS NULL OR (
      "correctCount" IS NOT NULL AND
      "incorrectCount" IS NOT NULL AND
      "netScore" = ("correctCount" * 2 - "incorrectCount")
    )
  );

-- Marks deducted equals the number of incorrect answers (1 mark each).
ALTER TABLE "TestAttempt" ADD CONSTRAINT "TestAttempt_marks_deducted"
  CHECK (
    "marksDeducted" IS NULL OR (
      "incorrectCount" IS NOT NULL AND
      "marksDeducted" = "incorrectCount"
    )
  );
