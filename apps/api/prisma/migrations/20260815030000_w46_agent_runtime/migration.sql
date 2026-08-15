-- W46 F1 / ADR-0036 — AI agent runtime.
--
-- Five new tables, zero changes to any existing one. AuditLog.actorType gains
-- 'agent' as a value, but it is already a free String column, so that costs no
-- DDL (same shape as the ADR-0035 note: the restriction lives in code, not in a
-- constraint).
--
-- AgentRun.requestId carries an index and NO foreign key — see schema.prisma.

-- CreateTable
CREATE TABLE "AgentPrincipal" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "runtime" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentPrincipal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "principalId" TEXT NOT NULL,
    "requestId" TEXT,
    "status" TEXT NOT NULL,
    "runState" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentStep" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "detail" TEXT,
    "retryable" BOOLEAN,
    "whoFixes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentMessage" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentProposal" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "interruptionRef" TEXT,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approvedById" TEXT,
    "rejectedReason" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentPrincipal_name_key" ON "AgentPrincipal"("name");

-- CreateIndex
CREATE INDEX "AgentRun_status_startedAt_idx" ON "AgentRun"("status", "startedAt");

-- CreateIndex
CREATE INDEX "AgentRun_requestId_idx" ON "AgentRun"("requestId");

-- CreateIndex
CREATE INDEX "AgentStep_runId_createdAt_idx" ON "AgentStep"("runId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentMessage_runId_createdAt_idx" ON "AgentMessage"("runId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentProposal_status_createdAt_idx" ON "AgentProposal"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_principalId_fkey" FOREIGN KEY ("principalId") REFERENCES "AgentPrincipal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentStep" ADD CONSTRAINT "AgentStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMessage" ADD CONSTRAINT "AgentMessage_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentProposal" ADD CONSTRAINT "AgentProposal_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
