-- CreateTable
CREATE TABLE "AssetScan" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "scanner" TEXT NOT NULL,
    "version" TEXT,
    "details" JSONB NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAnalysis" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "provider" TEXT NOT NULL,
    "durationMs" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "language" TEXT,
    "transcript" JSONB,
    "scenes" JSONB,
    "speakers" JSONB,
    "faces" JSONB,
    "warnings" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UGCProject" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "brief" JSONB NOT NULL,
    "plan" JSONB,
    "disclosure" JSONB,
    "renderedAssetIds" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UGCProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UGCShot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "script" TEXT NOT NULL,
    "durationSec" INTEGER NOT NULL,
    "sourceAssetId" TEXT,
    "consentSubject" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UGCShot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelComparison" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "constraints" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "winnerId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelComparison_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelComparisonOutput" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "comparisonId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "assetId" TEXT,
    "quote" JSONB,
    "error" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelComparisonOutput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomModelTrainingJob" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "provider" TEXT NOT NULL,
    "externalJobId" TEXT,
    "modelVersion" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "metrics" JSONB,
    "error" JSONB,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomModelTrainingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingRefund" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "provider" TEXT NOT NULL,
    "externalId" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "idempotencyKey" TEXT NOT NULL,
    "metadata" JSONB,
    "error" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingRefund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackupRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "region" TEXT NOT NULL,
    "objectKey" TEXT,
    "checksum" TEXT,
    "manifest" JSONB,
    "error" JSONB,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "BackupRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaunchEvidence" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "observedBy" TEXT,
    "evidenceKey" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LaunchEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssetScan_workspaceId_assetId_kind_status_idx" ON "AssetScan"("workspaceId", "assetId", "kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AssetScan_workspaceId_idempotencyKey_key" ON "AssetScan"("workspaceId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "MediaAnalysis_workspaceId_status_createdAt_idx" ON "MediaAnalysis"("workspaceId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAnalysis_workspaceId_assetId_key" ON "MediaAnalysis"("workspaceId", "assetId");

-- CreateIndex
CREATE INDEX "UGCProject_workspaceId_status_updatedAt_idx" ON "UGCProject"("workspaceId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UGCProject_workspaceId_name_key" ON "UGCProject"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "UGCShot_workspaceId_projectId_status_idx" ON "UGCShot"("workspaceId", "projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "UGCShot_projectId_sequence_key" ON "UGCShot"("projectId", "sequence");

-- CreateIndex
CREATE INDEX "ModelComparison_workspaceId_status_createdAt_idx" ON "ModelComparison"("workspaceId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ModelComparison_workspaceId_idempotencyKey_key" ON "ModelComparison"("workspaceId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ModelComparisonOutput_workspaceId_comparisonId_status_idx" ON "ModelComparisonOutput"("workspaceId", "comparisonId", "status");

-- CreateIndex
CREATE INDEX "CustomModelTrainingJob_workspaceId_projectId_status_created_idx" ON "CustomModelTrainingJob"("workspaceId", "projectId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomModelTrainingJob_workspaceId_idempotencyKey_key" ON "CustomModelTrainingJob"("workspaceId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "BillingRefund_workspaceId_status_createdAt_idx" ON "BillingRefund"("workspaceId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingRefund_workspaceId_idempotencyKey_key" ON "BillingRefund"("workspaceId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "BackupRun_workspaceId_kind_status_createdAt_idx" ON "BackupRun"("workspaceId", "kind", "status", "createdAt");

-- CreateIndex
CREATE INDEX "LaunchEvidence_workspaceId_kind_status_createdAt_idx" ON "LaunchEvidence"("workspaceId", "kind", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "AssetScan" ADD CONSTRAINT "AssetScan_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetScan" ADD CONSTRAINT "AssetScan_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAnalysis" ADD CONSTRAINT "MediaAnalysis_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAnalysis" ADD CONSTRAINT "MediaAnalysis_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UGCProject" ADD CONSTRAINT "UGCProject_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UGCShot" ADD CONSTRAINT "UGCShot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UGCShot" ADD CONSTRAINT "UGCShot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "UGCProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelComparison" ADD CONSTRAINT "ModelComparison_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelComparisonOutput" ADD CONSTRAINT "ModelComparisonOutput_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelComparisonOutput" ADD CONSTRAINT "ModelComparisonOutput_comparisonId_fkey" FOREIGN KEY ("comparisonId") REFERENCES "ModelComparison"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelComparisonOutput" ADD CONSTRAINT "ModelComparisonOutput_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomModelTrainingJob" ADD CONSTRAINT "CustomModelTrainingJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomModelTrainingJob" ADD CONSTRAINT "CustomModelTrainingJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "CustomModelProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomModelTrainingJob" ADD CONSTRAINT "CustomModelTrainingJob_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "CustomModelDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingRefund" ADD CONSTRAINT "BillingRefund_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingRefund" ADD CONSTRAINT "BillingRefund_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackupRun" ADD CONSTRAINT "BackupRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaunchEvidence" ADD CONSTRAINT "LaunchEvidence_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
