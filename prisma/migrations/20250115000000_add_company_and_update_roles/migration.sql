-- CreateTable: Create companies table
CREATE TABLE IF NOT EXISTS "companies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR NOT NULL,
    "tradeLicenseNumber" VARCHAR,
    "registrationNumber" VARCHAR,
    "vatTrn" VARCHAR,
    "corporateTaxTrn" VARCHAR,
    "freeZoneName" VARCHAR,
    "licenseType" VARCHAR,
    "licenseExpiryDate" TIMESTAMP(6),
    "industry" VARCHAR,
    "companySize" VARCHAR,
    "website" VARCHAR,
    "email" VARCHAR NOT NULL,
    "phone" VARCHAR,
    "address" TEXT,
    "poBox" VARCHAR,
    "city" VARCHAR,
    "emirate" VARCHAR,
    "country" VARCHAR DEFAULT 'UAE',
    "postalCode" VARCHAR,
    "logoUrl" TEXT,
    "description" TEXT,
    "authorizedSignatory" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Create unique indexes for companies
CREATE UNIQUE INDEX IF NOT EXISTS "companies_tradeLicenseNumber_key" ON "companies"("tradeLicenseNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "companies_registrationNumber_key" ON "companies"("registrationNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "companies_vatTrn_key" ON "companies"("vatTrn");
CREATE UNIQUE INDEX IF NOT EXISTS "companies_corporateTaxTrn_key" ON "companies"("corporateTaxTrn");

-- AlterTable: Add companyId column to users table
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "companyId" UUID;

-- AddForeignKey: Add foreign key from users to companies
ALTER TABLE "users" ADD CONSTRAINT "users_companyId_fkey" 
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: Rename recruiterId to clientId in jobs table
ALTER TABLE "jobs" RENAME COLUMN "recruiterId" TO "clientId";

-- DropForeignKey: Drop old foreign key constraint on jobs
ALTER TABLE "jobs" DROP CONSTRAINT IF EXISTS "FK_80472a2d1a7369d39f241c5f5f2";

-- AddForeignKey: Add new foreign key constraint for clientId in jobs
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_clientId_fkey" 
    FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- DropIndex: Drop old index on recruiterId
DROP INDEX IF EXISTS "IDX_JOBS_RECRUITER_ID";

-- CreateIndex: Create new index on clientId
CREATE INDEX IF NOT EXISTS "IDX_JOBS_CLIENT_ID" ON "jobs"("clientId");

-- AlterTable: Rename recruiterId to clientId in interviews table
ALTER TABLE "interviews" RENAME COLUMN "recruiterId" TO "clientId";

-- DropForeignKey: Drop old foreign key constraint on interviews
ALTER TABLE "interviews" DROP CONSTRAINT IF EXISTS "FK_d0757615c93f97a15702d673bc5";

-- AddForeignKey: Add new foreign key constraint for clientId in interviews
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_clientId_fkey" 
    FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- DropIndex: Drop old index on recruiterId
DROP INDEX IF EXISTS "IDX_INTERVIEWS_RECRUITER_ID";

-- CreateIndex: Create new index on clientId
CREATE INDEX IF NOT EXISTS "IDX_INTERVIEWS_CLIENT_ID" ON "interviews"("clientId");

-- Update existing users: Change 'recruiter' role to 'client' (if any exist)
-- This must be done after enum values are committed
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'recruiter' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'users_role_enum')) THEN
        UPDATE "users" SET "role" = 'client'::users_role_enum WHERE "role"::text = 'recruiter';
    END IF;
END $$;
