-- CreateTable
CREATE TABLE "OutboundFailure" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "payload" JSONB NOT NULL,
    "externalRef" JSONB,
    "lastError" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "lastAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,

    CONSTRAINT "OutboundFailure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutboundFailure_status_createdAt_idx" ON "OutboundFailure"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OutboundFailure_kind_status_idx" ON "OutboundFailure"("kind", "status");

-- AddForeignKey
ALTER TABLE "OutboundFailure" ADD CONSTRAINT "OutboundFailure_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE SET NULL ON UPDATE CASCADE;
