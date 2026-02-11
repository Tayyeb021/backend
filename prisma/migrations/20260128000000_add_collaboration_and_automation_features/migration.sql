-- CreateTable
CREATE TABLE "candidate_comments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "candidateId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "mentionedUserIds" TEXT[],
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_shares" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "candidateId" UUID NOT NULL,
    "sharedByUserId" UUID NOT NULL,
    "sharedWithUserId" UUID NOT NULL,
    "sharedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "candidate_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "candidateId" UUID,
    "userId" UUID NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "trigger" VARCHAR(100) NOT NULL,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "organizationId" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IDX_COMMENT_CANDIDATE" ON "candidate_comments"("candidateId");

-- CreateIndex
CREATE INDEX "IDX_COMMENT_USER" ON "candidate_comments"("userId");

-- CreateIndex
CREATE INDEX "IDX_SHARE_CANDIDATE" ON "candidate_shares"("candidateId");

-- CreateIndex
CREATE INDEX "IDX_SHARE_BY" ON "candidate_shares"("sharedByUserId");

-- CreateIndex
CREATE INDEX "IDX_SHARE_WITH" ON "candidate_shares"("sharedWithUserId");

-- CreateIndex
CREATE INDEX "IDX_ACTIVITY_CANDIDATE" ON "activity_logs"("candidateId");

-- CreateIndex
CREATE INDEX "IDX_ACTIVITY_USER" ON "activity_logs"("userId");

-- CreateIndex
CREATE INDEX "IDX_ACTIVITY_ACTION" ON "activity_logs"("action");

-- CreateIndex
CREATE INDEX "IDX_ACTIVITY_CREATED" ON "activity_logs"("createdAt");

-- CreateIndex
CREATE INDEX "IDX_AUTOMATION_TRIGGER" ON "automation_rules"("trigger");

-- CreateIndex
CREATE INDEX "IDX_AUTOMATION_ACTIVE" ON "automation_rules"("isActive");

-- CreateIndex
CREATE INDEX "IDX_AUTOMATION_ORG" ON "automation_rules"("organizationId");

-- AddForeignKey
ALTER TABLE "candidate_comments" ADD CONSTRAINT "candidate_comments_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "candidate_comments" ADD CONSTRAINT "candidate_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "candidate_shares" ADD CONSTRAINT "candidate_shares_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "candidate_shares" ADD CONSTRAINT "candidate_shares_sharedByUserId_fkey" FOREIGN KEY ("sharedByUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "candidate_shares" ADD CONSTRAINT "candidate_shares_sharedWithUserId_fkey" FOREIGN KEY ("sharedWithUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
