-- CreateEnum: Create new enums
CREATE TYPE "JobType" AS ENUM ('full_time', 'part_time', 'contract', 'freelance');
CREATE TYPE "WorkMode" AS ENUM ('remote', 'hybrid', 'onsite');
CREATE TYPE "EngagementType" AS ENUM ('short_term', 'long_term');
CREATE TYPE "BillingType" AS ENUM ('hourly', 'monthly', 'fixed');
CREATE TYPE "SeniorityLevel" AS ENUM ('junior', 'mid', 'senior', 'expert');
CREATE TYPE "ExperienceLevel" AS ENUM ('one_to_three', 'three_to_five', 'five_plus');
CREATE TYPE "JobPriority" AS ENUM ('low', 'normal', 'high');

-- AlterEnum: Update JobStatus enum (change 'active' to 'published')
-- PostgreSQL doesn't support removing enum values directly, so we recreate the enum
DO $$ BEGIN
  CREATE TYPE "JobStatus_new" AS ENUM ('draft', 'published', 'paused', 'closed');
  ALTER TABLE "jobs" ALTER COLUMN "status" TYPE "JobStatus_new" USING (
    CASE "status"::text
      WHEN 'active' THEN 'published'::"JobStatus_new"
      ELSE "status"::text::"JobStatus_new"
    END
  );
  DROP TYPE "JobStatus";
  ALTER TYPE "JobStatus_new" RENAME TO "JobStatus";
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable: Add new columns to jobs table
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "seniorityLevel" "SeniorityLevel" NOT NULL DEFAULT 'mid';
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "jobType" "JobType" NOT NULL DEFAULT 'full_time';
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "engagementLength" "EngagementType" NOT NULL DEFAULT 'long_term';
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "workMode" "WorkMode" NOT NULL DEFAULT 'remote';
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "country" VARCHAR(100);
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "timezone" VARCHAR(50);
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "minSalary" INTEGER;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "maxSalary" INTEGER;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "currency" VARCHAR(10);
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "billingType" "BillingType";
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "openings" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "hiringDeadline" TIMESTAMP(6);
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "priority" "JobPriority" NOT NULL DEFAULT 'normal';
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(6);
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(6);

-- AlterTable: Update title column to have length constraint
ALTER TABLE "jobs" ALTER COLUMN "title" TYPE VARCHAR(255);

-- Data Migration: Migrate location to country
UPDATE "jobs" SET "country" = "location" WHERE "location" IS NOT NULL AND "country" IS NULL;

-- Data Migration: Migrate experienceLevel string to enum
-- Create a temporary column for the enum conversion
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "experienceLevel_new" "ExperienceLevel";

-- Map existing string values to enum values
-- Note: Adjust these mappings based on your actual data patterns
UPDATE "jobs" SET "experienceLevel_new" = 'one_to_three'::"ExperienceLevel" 
WHERE LOWER("experienceLevel"::text) IN ('1-3', '1 to 3', 'junior', 'entry', 'one_to_three', '1_to_3', '1-3 years', '1-3 years experience');
UPDATE "jobs" SET "experienceLevel_new" = 'three_to_five'::"ExperienceLevel" 
WHERE LOWER("experienceLevel"::text) IN ('3-5', '3 to 5', 'mid', 'intermediate', 'three_to_five', '3_to_5', '3-5 years', '3-5 years experience');
UPDATE "jobs" SET "experienceLevel_new" = 'five_plus'::"ExperienceLevel" 
WHERE LOWER("experienceLevel"::text) IN ('5+', '5 plus', 'senior', 'expert', 'five_plus', '5_plus', '5+ years', '5+ years experience');

-- Set default for any remaining invalid values
UPDATE "jobs" SET "experienceLevel_new" = 'three_to_five'::"ExperienceLevel" 
WHERE "experienceLevel_new" IS NULL;

-- Drop old column and rename new column
ALTER TABLE "jobs" DROP COLUMN IF EXISTS "experienceLevel";
ALTER TABLE "jobs" RENAME COLUMN "experienceLevel_new" TO "experienceLevel";
ALTER TABLE "jobs" ALTER COLUMN "experienceLevel" SET NOT NULL;

-- CreateIndex: Add composite index for jobType and workMode
CREATE INDEX IF NOT EXISTS "jobs_jobType_workMode_idx" ON "jobs"("jobType", "workMode");

-- AlterTable: Drop old columns (location and salaryRange)
ALTER TABLE "jobs" DROP COLUMN IF EXISTS "location";
ALTER TABLE "jobs" DROP COLUMN IF EXISTS "salaryRange";
