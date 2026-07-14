-- CreateTable
CREATE TABLE "LedgerAdjustment" (
    "id" TEXT NOT NULL,
    "ledgerId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "beforeValue" INTEGER NOT NULL,
    "afterValue" INTEGER NOT NULL,
    "reason" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LedgerAdjustment_ledgerId_createdAt_idx" ON "LedgerAdjustment"("ledgerId", "createdAt");

-- AddForeignKey
ALTER TABLE "LedgerAdjustment" ADD CONSTRAINT "LedgerAdjustment_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "OpcoSkuLedger"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerAdjustment" ADD CONSTRAINT "LedgerAdjustment_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
