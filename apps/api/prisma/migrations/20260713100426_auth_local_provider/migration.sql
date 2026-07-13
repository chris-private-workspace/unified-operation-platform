-- AlterTable
ALTER TABLE "AppUser" ADD COLUMN     "authProvider" TEXT NOT NULL DEFAULT 'entra',
ADD COLUMN     "passwordHash" TEXT,
ALTER COLUMN "entraOid" DROP NOT NULL;
