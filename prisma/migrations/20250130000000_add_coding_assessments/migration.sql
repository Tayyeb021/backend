-- CreateEnum
CREATE TYPE "AssessmentStatus" AS ENUM ('pending', 'in_progress', 'submitted', 'expired');

-- CreateTable
CREATE TABLE "coding_assessments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "candidateId" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "interviewId" UUID,
    "recruiterId" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "language" VARCHAR(50) NOT NULL DEFAULT 'javascript',
    "testCases" JSONB NOT NULL,
    "maxScore" INTEGER NOT NULL DEFAULT 100,
    "status" "AssessmentStatus" NOT NULL DEFAULT 'pending',
    "startedAt" TIMESTAMP(6),
    "submittedAt" TIMESTAMP(6),
    "deadline" TIMESTAMP(6),
    "codeSubmission" TEXT,
    "testResults" JSONB,
    "score" INTEGER,
    "timeSpent" INTEGER,
    "codeReview" JSONB,
    "accessToken" VARCHAR(255),
    "tokenExpiry" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coding_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "coding_assessments_accessToken_key" ON "coding_assessments"("accessToken");

-- CreateIndex
CREATE INDEX "IDX_ASSESSMENT_CANDIDATE" ON "coding_assessments"("candidateId");

-- CreateIndex
CREATE INDEX "IDX_ASSESSMENT_JOB" ON "coding_assessments"("jobId");

-- CreateIndex
CREATE INDEX "IDX_ASSESSMENT_INTERVIEW" ON "coding_assessments"("interviewId");

-- CreateIndex
CREATE INDEX "IDX_ASSESSMENT_RECRUITER" ON "coding_assessments"("recruiterId");

-- CreateIndex
CREATE INDEX "IDX_ASSESSMENT_STATUS" ON "coding_assessments"("status");

-- AddForeignKey
ALTER TABLE "coding_assessments" ADD CONSTRAINT "coding_assessments_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "coding_assessments" ADD CONSTRAINT "coding_assessments_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "coding_assessments" ADD CONSTRAINT "coding_assessments_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "coding_assessments" ADD CONSTRAINT "coding_assessments_recruiterId_fkey" FOREIGN KEY ("recruiterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
