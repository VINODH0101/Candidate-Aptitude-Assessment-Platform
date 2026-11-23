-- CreateEnum
CREATE TYPE "Qualification" AS ENUM ('HIGH_SCHOOL', 'DIPLOMA', 'BACHELORS', 'MASTERS', 'DOCTORATE', 'OTHER');

-- AlterTable
ALTER TABLE "Candidate" ALTER COLUMN "age" SET NOT NULL,
ALTER COLUMN "phone" SET NOT NULL,
DROP COLUMN "highestQualification",
ADD COLUMN     "highestQualification" "Qualification" NOT NULL;


-- Candidate registration constraints.
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_age_range"
  CHECK ("age" BETWEEN 18 AND 60);
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_phone_format"
  CHECK ("phone" ~ '^[0-9]{10}$');
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_full_name_format"
  CHECK ("fullName" ~ '^[A-Za-z]+( [A-Za-z]+)*$' AND char_length("fullName") BETWEEN 2 AND 50);
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_city_length"
  CHECK ("city" IS NULL OR char_length("city") <= 100);
