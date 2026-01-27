-- Manual Migration: Add HireVue-like Features
-- Run this SQL directly on your PostgreSQL database

-- Add new enum types
CREATE TYPE "InterviewType" AS ENUM ('live', 'on_demand');
CREATE TYPE "QuestionType" AS ENUM ('behavioral', 'technical', 'situational', 'cultural_fit', 'coding', 'system_design');

-- Add new status to InterviewStatus enum
ALTER TYPE "InterviewStatus" ADD VALUE IF NOT EXISTS 'pending_candidate_response';

-- Add new columns to interviews table
ALTER TABLE "interviews" 
  ADD COLUMN IF NOT EXISTS "type" "InterviewType" NOT NULL DEFAULT 'live',
  ADD COLUMN IF NOT EXISTS "templateId" UUID,
  ADD COLUMN IF NOT EXISTS "allowSelfScheduling" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "deadline" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "invitationSentAt" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "candidateStartedAt" TIMESTAMP(6);

-- Create interview_templates table
CREATE TABLE IF NOT EXISTS "interview_templates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "clientId" UUID NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isPublic" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PK_interview_templates" PRIMARY KEY ("id")
);

-- Create interview_questions table
CREATE TABLE IF NOT EXISTS "interview_questions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "templateId" UUID NOT NULL,
  "question" TEXT NOT NULL,
  "type" "QuestionType" NOT NULL DEFAULT 'behavioral',
  "order" INTEGER NOT NULL DEFAULT 0,
  "timeLimit" INTEGER,
  "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PK_interview_questions" PRIMARY KEY ("id")
);

-- Add foreign key constraints
ALTER TABLE "interview_templates" 
  ADD CONSTRAINT "FK_interview_templates_client" 
  FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "interview_questions" 
  ADD CONSTRAINT "FK_interview_questions_template" 
  FOREIGN KEY ("templateId") REFERENCES "interview_templates"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "interviews" 
  ADD CONSTRAINT "FK_interviews_template" 
  FOREIGN KEY ("templateId") REFERENCES "interview_templates"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- Create indexes
CREATE INDEX IF NOT EXISTS "IDX_TEMPLATES_CLIENT_ID" ON "interview_templates"("clientId");
CREATE INDEX IF NOT EXISTS "IDX_QUESTIONS_TEMPLATE_ID" ON "interview_questions"("templateId");
CREATE INDEX IF NOT EXISTS "IDX_INTERVIEWS_TYPE" ON "interviews"("type");

-- Add updatedAt trigger for interview_templates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_interview_templates_updated_at BEFORE UPDATE ON "interview_templates"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_interview_questions_updated_at BEFORE UPDATE ON "interview_questions"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
