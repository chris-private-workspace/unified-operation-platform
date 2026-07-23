-- CreateTable
CREATE TABLE "ConnectorConfig" (
    "id" TEXT NOT NULL,
    "connector" TEXT NOT NULL,
    "graphTenantId" TEXT,
    "graphClientId" TEXT,
    "serviceNowInstanceUrl" TEXT,
    "serviceNowDefaultTable" TEXT,
    "requestSubmissionProvider" TEXT,
    "n8nOutboundWebhookUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConnectorConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorConfig_connector_key" ON "ConnectorConfig"("connector");
