-- AlterTable
ALTER TABLE "Request" ADD COLUMN     "serviceNowUserSyncedAt" TIMESTAMP(3),
ADD COLUMN     "serviceNowUserSysId" TEXT;
