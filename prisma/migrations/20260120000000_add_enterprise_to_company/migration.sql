-- AlterTable: Add isEnterprise field to companies table
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "isEnterprise" BOOLEAN NOT NULL DEFAULT false;
