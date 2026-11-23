-- New default: 15 minutes. Existing attempts keep their snapshot; only the
-- current settings row is normalized if it still held the old default.
ALTER TABLE "AppSetting" ALTER COLUMN "assessmentDurationMinutes" SET DEFAULT 15;
UPDATE "AppSetting" SET "assessmentDurationMinutes" = 15
  WHERE "id" = 1 AND "assessmentDurationMinutes" = 20;

-- At most 10 active questions, enforced at the database level
-- (serialized with an advisory lock to avoid concurrent activation races).
CREATE OR REPLACE FUNCTION "enforce_max_active_questions"() RETURNS trigger AS $$
DECLARE
  active_count integer;
BEGIN
  IF NEW."isActive" AND (TG_OP = 'INSERT' OR OLD."isActive" IS NOT TRUE) THEN
    PERFORM pg_advisory_xact_lock(555001);
    SELECT COUNT(*) INTO active_count
      FROM "Question" WHERE "isActive" AND "id" <> NEW."id";
    IF active_count >= 10 THEN
      RAISE EXCEPTION 'MAX_ACTIVE_QUESTIONS_EXCEEDED';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "question_max_active"
BEFORE INSERT OR UPDATE OF "isActive" ON "Question"
FOR EACH ROW EXECUTE FUNCTION "enforce_max_active_questions"();
