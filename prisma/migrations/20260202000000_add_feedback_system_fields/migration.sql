-- Create FeedbackPolicy enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FeedbackPolicy') THEN
    CREATE TYPE "FeedbackPolicy" AS ENUM ('automatic', 'manual', 'disabled');
  END IF;
END $$;

-- Add feedback system fields to companies table
ALTER TABLE "companies" 
ADD COLUMN IF NOT EXISTS "feedbackEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "defaultFeedbackPolicy" "FeedbackPolicy" DEFAULT 'manual';

-- Add feedback system fields to jobs table
ALTER TABLE "jobs" 
ADD COLUMN IF NOT EXISTS "feedbackEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "feedbackPolicy" "FeedbackPolicy" DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS "feedbackTemplateId" UUID;

-- Add foreign key constraint for feedbackTemplateId in jobs table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'jobs_feedbackTemplateId_fkey'
  ) THEN
    ALTER TABLE "jobs" 
    ADD CONSTRAINT "jobs_feedbackTemplateId_fkey" 
    FOREIGN KEY ("feedbackTemplateId") 
    REFERENCES "feedback_templates"("id") 
    ON DELETE SET NULL;
  END IF;
END $$;
