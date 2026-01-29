-- Quick fix: Add missing columns to jobs table if they don't exist
-- Run this SQL directly in your database if migrations aren't working

-- Add roleSpecId column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'jobs' AND column_name = 'roleSpecId'
    ) THEN
        ALTER TABLE "jobs" ADD COLUMN "roleSpecId" UUID;
    END IF;
END $$;

-- Add evaluationPolicyId column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'jobs' AND column_name = 'evaluationPolicyId'
    ) THEN
        ALTER TABLE "jobs" ADD COLUMN "evaluationPolicyId" UUID;
    END IF;
END $$;

-- Add foreign key constraint for roleSpecId if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'jobs_roleSpecId_fkey'
    ) THEN
        ALTER TABLE "jobs" ADD CONSTRAINT "jobs_roleSpecId_fkey" 
            FOREIGN KEY ("roleSpecId") REFERENCES "role_specs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- Add foreign key constraint for evaluationPolicyId if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'jobs_evaluationPolicyId_fkey'
    ) THEN
        ALTER TABLE "jobs" ADD CONSTRAINT "jobs_evaluationPolicyId_fkey" 
            FOREIGN KEY ("evaluationPolicyId") REFERENCES "evaluation_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
