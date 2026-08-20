-- AlterTable
ALTER TABLE "OutputAsset" ADD COLUMN     "campaignId" TEXT;

-- AlterTable
ALTER TABLE "PublishJob" ADD COLUMN     "campaignId" TEXT;

-- AlterTable
ALTER TABLE "ReviewTask" ADD COLUMN     "campaignId" TEXT;

-- AlterTable
ALTER TABLE "WorkflowRun" ADD COLUMN     "campaignId" TEXT;

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "briefId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "lifecycleStatus" TEXT NOT NULL DEFAULT 'NEEDS_INPUT',
    "briefSnapshot" JSONB NOT NULL,
    "brandSnapshot" JSONB,
    "templateSnapshot" JSONB,
    "costSnapshot" JSONB,
    "performanceSnapshot" JSONB,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignFact" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'NEEDS_CONFIRMATION',
    "lockPolicy" TEXT NOT NULL DEFAULT 'CONFIRM_BEFORE_USE',
    "confirmedBy" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativePassport" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "outputAssetId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEEDS_REVIEW',
    "evidence" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreativePassport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevisionRequest" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "targetAssetId" TEXT,
    "targetFrame" TEXT,
    "intent" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "affectedFields" JSONB NOT NULL,
    "validationImpacts" JSONB NOT NULL,
    "parentVersion" TEXT NOT NULL,
    "changePlan" JSONB,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "requestedBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevisionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "payload" JSONB,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryRule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "what" TEXT NOT NULL,
    "source" JSONB NOT NULL,
    "maxCostMinor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "approvalMode" TEXT NOT NULL DEFAULT 'APPROVAL',
    "schedule" JSONB,
    "fallback" TEXT,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_briefId_key" ON "Campaign"("briefId");

-- CreateIndex
CREATE INDEX "Campaign_workspaceId_lifecycleStatus_updatedAt_idx" ON "Campaign"("workspaceId", "lifecycleStatus", "updatedAt");

-- CreateIndex
CREATE INDEX "CampaignFact_workspaceId_campaignId_state_idx" ON "CampaignFact"("workspaceId", "campaignId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignFact_campaignId_field_version_key" ON "CampaignFact"("campaignId", "field", "version");

-- CreateIndex
CREATE INDEX "CreativePassport_workspaceId_campaignId_computedAt_idx" ON "CreativePassport"("workspaceId", "campaignId", "computedAt");

-- CreateIndex
CREATE INDEX "CreativePassport_workspaceId_outputAssetId_idx" ON "CreativePassport"("workspaceId", "outputAssetId");

-- CreateIndex
CREATE INDEX "RevisionRequest_workspaceId_campaignId_status_createdAt_idx" ON "RevisionRequest"("workspaceId", "campaignId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CampaignEvent_workspaceId_campaignId_createdAt_idx" ON "CampaignEvent"("workspaceId", "campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryRule_workspaceId_campaignId_paused_idx" ON "DeliveryRule"("workspaceId", "campaignId", "paused");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "CampaignBrief"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignFact" ADD CONSTRAINT "CampaignFact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignFact" ADD CONSTRAINT "CampaignFact_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativePassport" ADD CONSTRAINT "CreativePassport_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativePassport" ADD CONSTRAINT "CreativePassport_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevisionRequest" ADD CONSTRAINT "RevisionRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevisionRequest" ADD CONSTRAINT "RevisionRequest_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignEvent" ADD CONSTRAINT "CampaignEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignEvent" ADD CONSTRAINT "CampaignEvent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryRule" ADD CONSTRAINT "DeliveryRule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryRule" ADD CONSTRAINT "DeliveryRule_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewTask" ADD CONSTRAINT "ReviewTask_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutputAsset" ADD CONSTRAINT "OutputAsset_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishJob" ADD CONSTRAINT "PublishJob_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
