/*
  Warnings:

  - Added the required column `startedById` to the `AgentRun` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "AgentRun" ADD COLUMN     "startedById" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE SET NULL ON UPDATE CASCADE;
