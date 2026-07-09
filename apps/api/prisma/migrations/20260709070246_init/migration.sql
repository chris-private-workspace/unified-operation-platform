-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'REGIONAL', 'OPCO_IT');

-- CreateEnum
CREATE TYPE "DriftStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LineItemStage" AS ENUM ('REQUESTED', 'QUOTING', 'OPCO_APPROVED', 'AWAITING_VENDOR', 'READY', 'ASSIGNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('STAGE_CHANGE', 'ASSIGN', 'SYNC', 'RECONCILE', 'NOTE');

-- CreateTable
CREATE TABLE "AppUser" (
    "id" TEXT NOT NULL,
    "entraOid" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'REGIONAL',
    "opcoScopeId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opco" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "costCenter" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Opco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkuCatalog" (
    "id" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "skuPartNumber" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "businessAlias" TEXT,
    "category" TEXT,
    "isBaseLicense" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkuCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpcoSkuLedger" (
    "id" TEXT NOT NULL,
    "opcoId" TEXT NOT NULL,
    "skuCatalogId" TEXT NOT NULL,
    "allocatedQuantity" INTEGER NOT NULL DEFAULT 0,
    "assignedQuantity" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpcoSkuLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantSkuSnapshot" (
    "id" TEXT NOT NULL,
    "skuCatalogId" TEXT NOT NULL,
    "prepaidEnabled" INTEGER NOT NULL,
    "consumedUnits" INTEGER NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantSkuSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriftAlert" (
    "id" TEXT NOT NULL,
    "skuCatalogId" TEXT NOT NULL,
    "ledgerAssignedSum" INTEGER NOT NULL,
    "tenantConsumed" INTEGER NOT NULL,
    "delta" INTEGER NOT NULL,
    "status" "DriftStatus" NOT NULL DEFAULT 'OPEN',
    "note" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "DriftAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Request" (
    "id" TEXT NOT NULL,
    "serviceNowSysId" TEXT,
    "serviceNowNumber" TEXT,
    "serviceNowStatus" TEXT,
    "rawRequestText" TEXT,
    "requesterEmail" TEXT,
    "targetUpn" TEXT NOT NULL,
    "targetDisplayName" TEXT,
    "opcoId" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'OPEN',
    "handledById" TEXT,
    "accountCreatedAt" TIMESTAMP(3),
    "azureSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestLineItem" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "skuCatalogId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "procurementRequired" BOOLEAN NOT NULL DEFAULT false,
    "stage" "LineItemStage" NOT NULL DEFAULT 'REQUESTED',
    "quoteRef" TEXT,
    "poRef" TEXT,
    "quotedAt" TIMESTAMP(3),
    "opcoApprovedAt" TIMESTAMP(3),
    "vendorOrderedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "assignedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequestLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "lineItemId" TEXT,
    "type" "EventType" NOT NULL,
    "fromStage" "LineItemStage",
    "toStage" "LineItemStage",
    "message" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_entraOid_key" ON "AppUser"("entraOid");

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_email_key" ON "AppUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Opco_code_key" ON "Opco"("code");

-- CreateIndex
CREATE UNIQUE INDEX "SkuCatalog_skuId_key" ON "SkuCatalog"("skuId");

-- CreateIndex
CREATE UNIQUE INDEX "OpcoSkuLedger_opcoId_skuCatalogId_key" ON "OpcoSkuLedger"("opcoId", "skuCatalogId");

-- CreateIndex
CREATE INDEX "TenantSkuSnapshot_skuCatalogId_capturedAt_idx" ON "TenantSkuSnapshot"("skuCatalogId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Request_serviceNowSysId_key" ON "Request"("serviceNowSysId");

-- CreateIndex
CREATE INDEX "Request_opcoId_status_idx" ON "Request"("opcoId", "status");

-- CreateIndex
CREATE INDEX "RequestLineItem_requestId_idx" ON "RequestLineItem"("requestId");

-- CreateIndex
CREATE INDEX "RequestLineItem_stage_idx" ON "RequestLineItem"("stage");

-- CreateIndex
CREATE INDEX "RequestEvent_requestId_createdAt_idx" ON "RequestEvent"("requestId", "createdAt");

-- AddForeignKey
ALTER TABLE "AppUser" ADD CONSTRAINT "AppUser_opcoScopeId_fkey" FOREIGN KEY ("opcoScopeId") REFERENCES "Opco"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpcoSkuLedger" ADD CONSTRAINT "OpcoSkuLedger_opcoId_fkey" FOREIGN KEY ("opcoId") REFERENCES "Opco"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpcoSkuLedger" ADD CONSTRAINT "OpcoSkuLedger_skuCatalogId_fkey" FOREIGN KEY ("skuCatalogId") REFERENCES "SkuCatalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantSkuSnapshot" ADD CONSTRAINT "TenantSkuSnapshot_skuCatalogId_fkey" FOREIGN KEY ("skuCatalogId") REFERENCES "SkuCatalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriftAlert" ADD CONSTRAINT "DriftAlert_skuCatalogId_fkey" FOREIGN KEY ("skuCatalogId") REFERENCES "SkuCatalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_opcoId_fkey" FOREIGN KEY ("opcoId") REFERENCES "Opco"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestLineItem" ADD CONSTRAINT "RequestLineItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestLineItem" ADD CONSTRAINT "RequestLineItem_skuCatalogId_fkey" FOREIGN KEY ("skuCatalogId") REFERENCES "SkuCatalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestEvent" ADD CONSTRAINT "RequestEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestEvent" ADD CONSTRAINT "RequestEvent_lineItemId_fkey" FOREIGN KEY ("lineItemId") REFERENCES "RequestLineItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestEvent" ADD CONSTRAINT "RequestEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
