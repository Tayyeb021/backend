-- Rename all enum types to PascalCase to match Prisma schema
ALTER TYPE "candidates_status_enum" RENAME TO "CandidateStatus";
ALTER TYPE "clients_status_enum" RENAME TO "ClientStatus";
ALTER TYPE "clients_type_enum" RENAME TO "ClientType";
ALTER TYPE "interviews_language_enum" RENAME TO "InterviewLanguage";
ALTER TYPE "interviews_status_enum" RENAME TO "InterviewStatus";
ALTER TYPE "jobs_status_enum" RENAME TO "JobStatus";
