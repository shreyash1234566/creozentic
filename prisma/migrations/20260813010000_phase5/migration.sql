-- CreateTable
CREATE TABLE "WorkspacePolicy" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "content" JSONB NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspacePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenchmarkSuite" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "groundTruth" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BenchmarkSuite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenchmarkCase" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "suiteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "expected" JSONB NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BenchmarkCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenchmarkRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "suiteId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "modelRef" TEXT,
    "summary" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "BenchmarkRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenchmarkResult" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BenchmarkResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplacePackage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "workflowVersionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "manifest" JSONB NOT NULL,
    "documentation" JSONB NOT NULL,
    "costEstimate" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplacePackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceInstall" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "alias" TEXT,
    "installedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceInstall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceReview" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorSource" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'CUSTOMER_PROVIDED',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "terms" TEXT,
    "consent" JSONB NOT NULL,
    "lastFetchedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CompetitorSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorInsight" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "retrievedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ADVISORY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitorInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhiteLabelConfig" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "logoAssetId" TEXT,
    "portalSlug" TEXT NOT NULL,
    "customDomain" TEXT,
    "supportEmail" TEXT,
    "theme" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhiteLabelConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnterpriseControl" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "dataRegion" TEXT NOT NULL DEFAULT 'IN',
    "retentionDays" INTEGER NOT NULL DEFAULT 90,
    "auditExport" BOOLEAN NOT NULL DEFAULT true,
    "ssoRequired" BOOLEAN NOT NULL DEFAULT false,
    "ssoProvider" TEXT,
    "ssoMetadata" JSONB,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnterpriseControl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomModelProject" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "baselineSuiteId" TEXT,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "rightsEvidence" JSONB NOT NULL,
    "deletionRequestedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomModelProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomModelDataset" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "assetIds" JSONB NOT NULL,
    "consent" JSONB NOT NULL,
    "hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomModelDataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomModelEvaluation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "datasetId" TEXT,
    "modelVersion" TEXT NOT NULL,
    "baselineScore" DOUBLE PRECISION NOT NULL,
    "modelScore" DOUBLE PRECISION NOT NULL,
    "unitCostMinor" INTEGER NOT NULL,
    "metrics" JSONB NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomModelEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomModelRelease" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DISABLED',
    "evaluationId" TEXT,
    "providerRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomModelRelease_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkspacePolicy_workspaceId_kind_status_idx" ON "WorkspacePolicy"("workspaceId", "kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspacePolicy_workspaceId_kind_version_key" ON "WorkspacePolicy"("workspaceId", "kind", "version");

-- CreateIndex
CREATE INDEX "BenchmarkSuite_workspaceId_status_idx" ON "BenchmarkSuite"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BenchmarkSuite_workspaceId_slug_key" ON "BenchmarkSuite"("workspaceId", "slug");

-- CreateIndex
CREATE INDEX "BenchmarkCase_workspaceId_suiteId_idx" ON "BenchmarkCase"("workspaceId", "suiteId");

-- CreateIndex
CREATE INDEX "BenchmarkRun_workspaceId_suiteId_startedAt_idx" ON "BenchmarkRun"("workspaceId", "suiteId", "startedAt");

-- CreateIndex
CREATE INDEX "BenchmarkResult_workspaceId_passed_idx" ON "BenchmarkResult"("workspaceId", "passed");

-- CreateIndex
CREATE UNIQUE INDEX "BenchmarkResult_runId_caseId_key" ON "BenchmarkResult"("runId", "caseId");

-- CreateIndex
CREATE INDEX "MarketplacePackage_visibility_status_createdAt_idx" ON "MarketplacePackage"("visibility", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplacePackage_workspaceId_slug_version_key" ON "MarketplacePackage"("workspaceId", "slug", "version");

-- CreateIndex
CREATE INDEX "MarketplaceInstall_workspaceId_status_idx" ON "MarketplaceInstall"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceInstall_workspaceId_packageId_key" ON "MarketplaceInstall"("workspaceId", "packageId");

-- CreateIndex
CREATE INDEX "MarketplaceReview_packageId_status_idx" ON "MarketplaceReview"("packageId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceReview_workspaceId_packageId_reviewerId_key" ON "MarketplaceReview"("workspaceId", "packageId", "reviewerId");

-- CreateIndex
CREATE INDEX "CompetitorSource_workspaceId_status_lastFetchedAt_idx" ON "CompetitorSource"("workspaceId", "status", "lastFetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitorSource_workspaceId_url_key" ON "CompetitorSource"("workspaceId", "url");

-- CreateIndex
CREATE INDEX "CompetitorInsight_workspaceId_sourceId_createdAt_idx" ON "CompetitorInsight"("workspaceId", "sourceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhiteLabelConfig_workspaceId_key" ON "WhiteLabelConfig"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "WhiteLabelConfig_portalSlug_key" ON "WhiteLabelConfig"("portalSlug");

-- CreateIndex
CREATE UNIQUE INDEX "EnterpriseControl_workspaceId_key" ON "EnterpriseControl"("workspaceId");

-- CreateIndex
CREATE INDEX "CustomModelProject_workspaceId_status_idx" ON "CustomModelProject"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CustomModelProject_workspaceId_name_key" ON "CustomModelProject"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "CustomModelDataset_workspaceId_projectId_status_idx" ON "CustomModelDataset"("workspaceId", "projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CustomModelDataset_projectId_version_key" ON "CustomModelDataset"("projectId", "version");

-- CreateIndex
CREATE INDEX "CustomModelEvaluation_workspaceId_projectId_createdAt_idx" ON "CustomModelEvaluation"("workspaceId", "projectId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomModelRelease_workspaceId_status_idx" ON "CustomModelRelease"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CustomModelRelease_projectId_modelVersion_key" ON "CustomModelRelease"("projectId", "modelVersion");

-- AddForeignKey
ALTER TABLE "WorkspacePolicy" ADD CONSTRAINT "WorkspacePolicy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenchmarkSuite" ADD CONSTRAINT "BenchmarkSuite_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenchmarkCase" ADD CONSTRAINT "BenchmarkCase_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenchmarkCase" ADD CONSTRAINT "BenchmarkCase_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "BenchmarkSuite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenchmarkRun" ADD CONSTRAINT "BenchmarkRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenchmarkRun" ADD CONSTRAINT "BenchmarkRun_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "BenchmarkSuite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenchmarkResult" ADD CONSTRAINT "BenchmarkResult_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenchmarkResult" ADD CONSTRAINT "BenchmarkResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "BenchmarkRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplacePackage" ADD CONSTRAINT "MarketplacePackage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplacePackage" ADD CONSTRAINT "MarketplacePackage_workflowVersionId_fkey" FOREIGN KEY ("workflowVersionId") REFERENCES "WorkflowVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceInstall" ADD CONSTRAINT "MarketplaceInstall_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceInstall" ADD CONSTRAINT "MarketplaceInstall_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "MarketplacePackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceReview" ADD CONSTRAINT "MarketplaceReview_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceReview" ADD CONSTRAINT "MarketplaceReview_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "MarketplacePackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceReview" ADD CONSTRAINT "MarketplaceReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorSource" ADD CONSTRAINT "CompetitorSource_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorInsight" ADD CONSTRAINT "CompetitorInsight_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorInsight" ADD CONSTRAINT "CompetitorInsight_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "CompetitorSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhiteLabelConfig" ADD CONSTRAINT "WhiteLabelConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhiteLabelConfig" ADD CONSTRAINT "WhiteLabelConfig_logoAssetId_fkey" FOREIGN KEY ("logoAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnterpriseControl" ADD CONSTRAINT "EnterpriseControl_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomModelProject" ADD CONSTRAINT "CustomModelProject_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomModelProject" ADD CONSTRAINT "CustomModelProject_baselineSuiteId_fkey" FOREIGN KEY ("baselineSuiteId") REFERENCES "BenchmarkSuite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomModelDataset" ADD CONSTRAINT "CustomModelDataset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomModelDataset" ADD CONSTRAINT "CustomModelDataset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "CustomModelProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomModelEvaluation" ADD CONSTRAINT "CustomModelEvaluation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomModelEvaluation" ADD CONSTRAINT "CustomModelEvaluation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "CustomModelProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomModelRelease" ADD CONSTRAINT "CustomModelRelease_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomModelRelease" ADD CONSTRAINT "CustomModelRelease_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "CustomModelProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

