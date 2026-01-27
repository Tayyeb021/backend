-- First, add the missing enum value if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'awaiting_review' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'InterviewStatus')) THEN
        ALTER TYPE "InterviewStatus" ADD VALUE 'awaiting_review';
    END IF;
END $$;

-- Add roundNumber column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'interviews' AND column_name = 'roundNumber') THEN
        ALTER TABLE "interviews" ADD COLUMN "roundNumber" INTEGER DEFAULT 1;
        -- Update existing rows to have roundNumber = 1
        UPDATE "interviews" SET "roundNumber" = 1 WHERE "roundNumber" IS NULL;
    END IF;
END $$;

-- Add externalMeetingUrl column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'interviews' AND column_name = 'externalMeetingUrl') THEN
        ALTER TABLE "interviews" ADD COLUMN "externalMeetingUrl" VARCHAR;
    END IF;
END $$;

-- CreateTable: Create audit_logs table
CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID,
    "userEmail" VARCHAR,
    "action" VARCHAR(100) NOT NULL,
    "resource" VARCHAR(100) NOT NULL,
    "resourceId" UUID,
    "changes" JSONB,
    "ipAddress" VARCHAR(45),
    "userAgent" TEXT,
    "metadata" JSONB,
    "organizationId" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Create indexes for audit_logs
CREATE INDEX IF NOT EXISTS "IDX_AUDIT_USER_ID" ON "audit_logs"("userId");
CREATE INDEX IF NOT EXISTS "IDX_AUDIT_RESOURCE" ON "audit_logs"("resource", "resourceId");
CREATE INDEX IF NOT EXISTS "IDX_AUDIT_ACTION" ON "audit_logs"("action");
CREATE INDEX IF NOT EXISTS "IDX_AUDIT_CREATED_AT" ON "audit_logs"("createdAt");
CREATE INDEX IF NOT EXISTS "IDX_AUDIT_ORG_ID" ON "audit_logs"("organizationId");

-- CreateTable: Create permissions table
CREATE TABLE IF NOT EXISTS "permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "resource" VARCHAR(100) NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "description" VARCHAR(255),
    "conditions" JSONB,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "permissions_name_key" UNIQUE ("name")
);

-- CreateIndex: Create index for permissions
CREATE INDEX IF NOT EXISTS "IDX_PERM_RESOURCE_ACTION" ON "permissions"("resource", "action");

-- CreateTable: Create roles table
CREATE TABLE IF NOT EXISTS "roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(255),
    "organizationId" UUID,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Create indexes for roles
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ROLE_NAME_ORG" ON "roles"("name", "organizationId");
CREATE INDEX IF NOT EXISTS "IDX_ROLE_ORG_ID" ON "roles"("organizationId");

-- CreateTable: Create role_permissions table
CREATE TABLE IF NOT EXISTS "role_permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "UQ_ROLE_PERM" UNIQUE ("roleId", "permissionId")
);

-- CreateTable: Create user_roles table
CREATE TABLE IF NOT EXISTS "user_roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "organizationId" UUID,
    "assignedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" UUID,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "UQ_USER_ROLE" UNIQUE ("userId", "roleId", "organizationId")
);

-- CreateIndex: Create indexes for user_roles
CREATE INDEX IF NOT EXISTS "IDX_USER_ROLE_USER" ON "user_roles"("userId");
CREATE INDEX IF NOT EXISTS "IDX_USER_ROLE_ORG" ON "user_roles"("organizationId");

-- CreateTable: Create webhooks table
CREATE TABLE IF NOT EXISTS "webhooks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID,
    "url" VARCHAR(500) NOT NULL,
    "events" TEXT[],
    "secret" VARCHAR(255) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "headers" JSONB,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Create index for webhooks
CREATE INDEX IF NOT EXISTS "IDX_WEBHOOK_ORG" ON "webhooks"("organizationId");

-- CreateTable: Create webhook_deliveries table
CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "webhookId" UUID NOT NULL,
    "event" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "statusCode" INTEGER,
    "response" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "deliveredAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Create indexes for webhook_deliveries
CREATE INDEX IF NOT EXISTS "IDX_WEBHOOK_DELIVERY_WEBHOOK" ON "webhook_deliveries"("webhookId");
CREATE INDEX IF NOT EXISTS "IDX_WEBHOOK_DELIVERY_STATUS" ON "webhook_deliveries"("status");

-- AddForeignKey: Add foreign key from role_permissions to roles
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'role_permissions_roleId_fkey') THEN
        ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" 
            FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey: Add foreign key from role_permissions to permissions
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'role_permissions_permissionId_fkey') THEN
        ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" 
            FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey: Add foreign key from user_roles to roles
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_roleId_fkey') THEN
        ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" 
            FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey: Add foreign key from webhook_deliveries to webhooks
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'webhook_deliveries_webhookId_fkey') THEN
        ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhookId_fkey" 
            FOREIGN KEY ("webhookId") REFERENCES "webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
