-- CreateEnum: RoleSpecStatus
CREATE TYPE "RoleSpecStatus" AS ENUM ('draft', 'locked', 'archived');

-- CreateEnum: RoleSpecSource
CREATE TYPE "RoleSpecSource" AS ENUM ('new', 'template', 'clone');

-- CreateEnum: ProfileCertificationStatus
CREATE TYPE "ProfileCertificationStatus" AS ENUM ('pending', 'certified', 'rejected', 'expired');

-- CreateEnum: HiringDecisionStatus
CREATE TYPE "HiringDecisionStatus" AS ENUM ('pending', 'approved', 'rejected', 'on_hold');

-- CreateEnum: HiringDecisionType
CREATE TYPE "HiringDecisionType" AS ENUM ('hire', 'reject', 'hold', 'offer_pending');

-- CreateTable: role_specs
CREATE TABLE IF NOT EXISTS "role_specs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "RoleSpecStatus" NOT NULL DEFAULT 'draft',
    "source" "RoleSpecSource" NOT NULL DEFAULT 'new',
    "title" VARCHAR(255) NOT NULL,
    "department" VARCHAR(100),
    "seniorityLevel" "SeniorityLevel" NOT NULL,
    "location" VARCHAR(100),
    "employmentType" "JobType" NOT NULL,
    "workMode" "WorkMode" NOT NULL,
    "jobDescription" TEXT NOT NULL,
    "mustHaveSkills" TEXT[],
    "niceToHaveSkills" TEXT[],
    "clientId" UUID NOT NULL,
    "templateId" UUID,
    "clonedFromId" UUID,
    "lockedAt" TIMESTAMP(6),
    "lockedBy" UUID,
    "validatedAt" TIMESTAMP(6),
    "evaluationPolicyId" UUID,
    "rolePackId" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_specs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: role_packs
CREATE TABLE IF NOT EXISTS "role_packs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(100) NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "organizationId" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_packs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: evaluation_policies
CREATE TABLE IF NOT EXISTS "evaluation_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "technicalWeight" DOUBLE PRECISION NOT NULL DEFAULT 40,
    "communicationWeight" DOUBLE PRECISION NOT NULL DEFAULT 25,
    "problemSolvingWeight" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "culturalFitWeight" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "minPassingScore" DOUBLE PRECISION NOT NULL DEFAULT 70,
    "scoreNormalization" BOOLEAN NOT NULL DEFAULT true,
    "requireEvidence" BOOLEAN NOT NULL DEFAULT true,
    "evidenceConfidenceThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "clientId" UUID NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lockedAt" TIMESTAMP(6),
    "lockedBy" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluation_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable: score_evidence
CREATE TABLE IF NOT EXISTS "score_evidence" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scoreId" VARCHAR(255) NOT NULL,
    "scoreType" VARCHAR(50) NOT NULL,
    "scoreValue" DOUBLE PRECISION NOT NULL,
    "evidenceType" VARCHAR(50) NOT NULL,
    "evidenceSource" VARCHAR(100) NOT NULL,
    "evidenceId" UUID NOT NULL,
    "transcriptSnippet" TEXT,
    "timestampStart" DOUBLE PRECISION,
    "timestampEnd" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "isImmutable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "score_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable: certified_profiles
CREATE TABLE IF NOT EXISTS "certified_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "candidateId" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "scores" JSONB NOT NULL,
    "evidenceSummary" JSONB NOT NULL,
    "ranking" INTEGER NOT NULL,
    "rankingSnapshotId" UUID,
    "status" "ProfileCertificationStatus" NOT NULL DEFAULT 'pending',
    "certifiedAt" TIMESTAMP(6),
    "certifiedBy" UUID,
    "expiresAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certified_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable: skill_taxonomy
CREATE TABLE IF NOT EXISTS "skill_taxonomy" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "preferredLabel" VARCHAR(255) NOT NULL,
    "aliases" TEXT[],
    "category" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skill_taxonomy_pkey" PRIMARY KEY ("id")
);

-- CreateTable: evaluation_blueprints
CREATE TABLE IF NOT EXISTS "evaluation_blueprints" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "questionMappings" JSONB NOT NULL,
    "skillMappings" JSONB NOT NULL,
    "scoringRules" JSONB NOT NULL,
    "clientId" UUID NOT NULL,
    "roleSpecId" UUID,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluation_blueprints_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ranking_snapshots
CREATE TABLE IF NOT EXISTS "ranking_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "jobId" UUID NOT NULL,
    "snapshotDate" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rankings" JSONB NOT NULL,
    "totalCandidates" INTEGER NOT NULL,
    "tieBreaks" JSONB,
    "createdBy" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ranking_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable: hiring_decisions
CREATE TABLE IF NOT EXISTS "hiring_decisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "candidateId" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "decisionType" "HiringDecisionType" NOT NULL,
    "status" "HiringDecisionStatus" NOT NULL DEFAULT 'pending',
    "rationale" TEXT NOT NULL,
    "madeBy" UUID NOT NULL,
    "madeAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "overridesAI" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hiring_decisions_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey: role_specs -> users (clientId)
ALTER TABLE "role_specs" ADD CONSTRAINT "role_specs_clientId_fkey" 
    FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: role_specs -> users (lockedBy)
ALTER TABLE "role_specs" ADD CONSTRAINT "role_specs_lockedBy_fkey" 
    FOREIGN KEY ("lockedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: role_specs -> role_specs (templateId)
ALTER TABLE "role_specs" ADD CONSTRAINT "role_specs_templateId_fkey" 
    FOREIGN KEY ("templateId") REFERENCES "role_specs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: role_specs -> role_specs (clonedFromId)
ALTER TABLE "role_specs" ADD CONSTRAINT "role_specs_clonedFromId_fkey" 
    FOREIGN KEY ("clonedFromId") REFERENCES "role_specs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: role_specs -> evaluation_policies
ALTER TABLE "role_specs" ADD CONSTRAINT "role_specs_evaluationPolicyId_fkey" 
    FOREIGN KEY ("evaluationPolicyId") REFERENCES "evaluation_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: role_specs -> role_packs
ALTER TABLE "role_specs" ADD CONSTRAINT "role_specs_rolePackId_fkey" 
    FOREIGN KEY ("rolePackId") REFERENCES "role_packs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: evaluation_policies -> users (clientId)
ALTER TABLE "evaluation_policies" ADD CONSTRAINT "evaluation_policies_clientId_fkey" 
    FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: evaluation_policies -> users (lockedBy)
ALTER TABLE "evaluation_policies" ADD CONSTRAINT "evaluation_policies_lockedBy_fkey" 
    FOREIGN KEY ("lockedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Note: score_evidence.evidenceId can reference either interviews or coding_assessments
-- We'll use a check constraint or application-level validation instead of foreign keys
-- since PostgreSQL doesn't support conditional foreign keys

-- AddForeignKey: certified_profiles -> candidates
ALTER TABLE "certified_profiles" ADD CONSTRAINT "certified_profiles_candidateId_fkey" 
    FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: certified_profiles -> jobs
ALTER TABLE "certified_profiles" ADD CONSTRAINT "certified_profiles_jobId_fkey" 
    FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: certified_profiles -> users (certifiedBy)
ALTER TABLE "certified_profiles" ADD CONSTRAINT "certified_profiles_certifiedBy_fkey" 
    FOREIGN KEY ("certifiedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: evaluation_blueprints -> users (clientId)
ALTER TABLE "evaluation_blueprints" ADD CONSTRAINT "evaluation_blueprints_clientId_fkey" 
    FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: evaluation_blueprints -> role_specs
ALTER TABLE "evaluation_blueprints" ADD CONSTRAINT "evaluation_blueprints_roleSpecId_fkey" 
    FOREIGN KEY ("roleSpecId") REFERENCES "role_specs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: hiring_decisions -> candidates
ALTER TABLE "hiring_decisions" ADD CONSTRAINT "hiring_decisions_candidateId_fkey" 
    FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: hiring_decisions -> jobs
ALTER TABLE "hiring_decisions" ADD CONSTRAINT "hiring_decisions_jobId_fkey" 
    FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: hiring_decisions -> users (madeBy)
ALTER TABLE "hiring_decisions" ADD CONSTRAINT "hiring_decisions_madeBy_fkey" 
    FOREIGN KEY ("madeBy") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add column to jobs table
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "roleSpecId" UUID;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "evaluationPolicyId" UUID;

-- AddForeignKey: jobs -> role_specs
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_roleSpecId_fkey" 
    FOREIGN KEY ("roleSpecId") REFERENCES "role_specs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: jobs -> evaluation_policies
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_evaluationPolicyId_fkey" 
    FOREIGN KEY ("evaluationPolicyId") REFERENCES "evaluation_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add column to interviews table
ALTER TABLE "interviews" ADD COLUMN IF NOT EXISTS "evaluationBlueprintId" UUID;

-- AddForeignKey: interviews -> evaluation_blueprints
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_evaluationBlueprintId_fkey" 
    FOREIGN KEY ("evaluationBlueprintId") REFERENCES "evaluation_blueprints"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IDX_ROLE_SPEC_CLIENT" ON "role_specs"("clientId");
CREATE INDEX IF NOT EXISTS "IDX_ROLE_SPEC_STATUS" ON "role_specs"("status");
CREATE INDEX IF NOT EXISTS "IDX_ROLE_SPEC_TEMPLATE" ON "role_specs"("templateId");
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ROLE_SPEC_VERSION" ON "role_specs"("id", "version");
CREATE INDEX IF NOT EXISTS "IDX_ROLE_PACK_CATEGORY" ON "role_packs"("category");
CREATE INDEX IF NOT EXISTS "IDX_ROLE_PACK_ORG" ON "role_packs"("organizationId");
CREATE INDEX IF NOT EXISTS "IDX_EVAL_POLICY_CLIENT" ON "evaluation_policies"("clientId");
CREATE INDEX IF NOT EXISTS "IDX_EVAL_POLICY_DEFAULT" ON "evaluation_policies"("isDefault");
CREATE INDEX IF NOT EXISTS "IDX_EVAL_POLICY_ACTIVE" ON "evaluation_policies"("isActive");
CREATE INDEX IF NOT EXISTS "IDX_EVIDENCE_SCORE" ON "score_evidence"("scoreId");
CREATE INDEX IF NOT EXISTS "IDX_EVIDENCE_SOURCE" ON "score_evidence"("evidenceId");
CREATE INDEX IF NOT EXISTS "IDX_EVIDENCE_TYPE" ON "score_evidence"("scoreType");
CREATE INDEX IF NOT EXISTS "IDX_CERT_PROFILE_CANDIDATE" ON "certified_profiles"("candidateId");
CREATE INDEX IF NOT EXISTS "IDX_CERT_PROFILE_JOB" ON "certified_profiles"("jobId");
CREATE INDEX IF NOT EXISTS "IDX_CERT_PROFILE_STATUS" ON "certified_profiles"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_CERT_PROFILE_CANDIDATE_JOB" ON "certified_profiles"("candidateId", "jobId");
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_SKILL_PREFERRED_LABEL" ON "skill_taxonomy"("preferredLabel");
CREATE INDEX IF NOT EXISTS "IDX_SKILL_CATEGORY" ON "skill_taxonomy"("category");
CREATE INDEX IF NOT EXISTS "IDX_BLUEPRINT_CLIENT" ON "evaluation_blueprints"("clientId");
CREATE INDEX IF NOT EXISTS "IDX_BLUEPRINT_ROLE_SPEC" ON "evaluation_blueprints"("roleSpecId");
CREATE INDEX IF NOT EXISTS "IDX_RANKING_JOB" ON "ranking_snapshots"("jobId");
CREATE INDEX IF NOT EXISTS "IDX_RANKING_DATE" ON "ranking_snapshots"("snapshotDate");
CREATE INDEX IF NOT EXISTS "IDX_RANKING_ACTIVE" ON "ranking_snapshots"("isActive");
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_DECISION_CANDIDATE_JOB" ON "hiring_decisions"("candidateId", "jobId");
CREATE INDEX IF NOT EXISTS "IDX_DECISION_CANDIDATE" ON "hiring_decisions"("candidateId");
CREATE INDEX IF NOT EXISTS "IDX_DECISION_JOB" ON "hiring_decisions"("jobId");
CREATE INDEX IF NOT EXISTS "IDX_DECISION_STATUS" ON "hiring_decisions"("status");
