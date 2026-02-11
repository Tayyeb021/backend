-- CreateEnum
CREATE TYPE "VideoProcessingStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- AlterTable
ALTER TABLE "interviews" ADD COLUMN "videoProcessingStatus" "VideoProcessingStatus",
ADD COLUMN "videoProcessingStartedAt" TIMESTAMP(6),
ADD COLUMN "videoProcessingCompletedAt" TIMESTAMP(6),
ADD COLUMN "videoProcessingError" TEXT;
