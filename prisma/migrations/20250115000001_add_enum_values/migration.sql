-- Step 1: Add new enum values (must be committed separately)
ALTER TYPE "users_role_enum" ADD VALUE IF NOT EXISTS 'client';
ALTER TYPE "users_role_enum" ADD VALUE IF NOT EXISTS 'interviewee';
