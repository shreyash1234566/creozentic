-- AlterTable
ALTER TABLE "OutboxEvent" ADD COLUMN     "actorId" TEXT,
ADD COLUMN     "actorType" TEXT,
ADD COLUMN     "brandId" TEXT,
ADD COLUMN     "causationId" TEXT,
ADD COLUMN     "channel" TEXT,
ADD COLUMN     "policyContext" JSONB;

-- AlterTable
ALTER TABLE "PerformanceMetric" ADD COLUMN     "confidence" DOUBLE PRECISION,
ADD COLUMN     "consent" JSONB,
ADD COLUMN     "creativeAttributes" JSONB;

-- AlterTable
ALTER TABLE "Schedule" ADD COLUMN     "autonomyMode" TEXT,
ADD COLUMN     "brandId" TEXT;

-- CreateTable
CREATE TABLE "DailyContentPlan" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT,
    "scheduleId" TEXT,
    "planDate" TIMESTAMP(3) NOT NULL,
    "brandProfileVersion" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "autonomyMode" TEXT NOT NULL DEFAULT 'APPROVAL',
    "pillarMix" JSONB NOT NULL,
    "campaignIds" JSONB,
    "plannedOutputs" JSONB,
    "costEstimate" JSONB,
    "reviewerId" TEXT,
    "approvalSlaHours" INTEGER NOT NULL DEFAULT 12,
    "source" TEXT NOT NULL DEFAULT 'DASHBOARD',
    "createdBy" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyContentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativeRequest" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT,
    "dailyPlanId" TEXT,
    "source" TEXT NOT NULL,
    "rawMessage" TEXT NOT NULL,
    "normalizedBrief" JSONB,
    "missingFields" JSONB,
    "requesterId" TEXT,
    "channel" TEXT,
    "requestedDate" TIMESTAMP(3),
    "consent" JSONB,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreativeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "dailyPlanId" TEXT,
    "creativeRequestId" TEXT,
    "parentRunId" TEXT,
    "agentType" TEXT NOT NULL,
    "agentVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "inputContextHash" TEXT NOT NULL,
    "toolCalls" JSONB NOT NULL,
    "budgetCredits" INTEGER NOT NULL DEFAULT 0,
    "reservedCredits" INTEGER NOT NULL DEFAULT 0,
    "tokenCount" INTEGER,
    "durationMs" INTEGER,
    "output" JSONB,
    "confidence" DOUBLE PRECISION,
    "pauseReason" TEXT,
    "error" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativePlan" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "dailyPlanId" TEXT,
    "creativeRequestId" TEXT,
    "objective" TEXT NOT NULL,
    "angle" TEXT NOT NULL,
    "templateId" TEXT,
    "templateVersion" TEXT,
    "sourceAssetIds" JSONB NOT NULL,
    "copySlots" JSONB NOT NULL,
    "modelNodes" JSONB NOT NULL,
    "outputs" JSONB,
    "evidenceIds" JSONB NOT NULL,
    "estimatedCostCredits" INTEGER NOT NULL,
    "approvalRequired" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreativePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalGate" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "dailyPlanId" TEXT,
    "creativePlanId" TEXT,
    "outputAssetId" TEXT,
    "assetVersion" TEXT,
    "reviewerId" TEXT,
    "reviewerRole" TEXT,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "comments" JSONB,
    "diff" JSONB,
    "expiresAt" TIMESTAMP(3),
    "slaHours" INTEGER NOT NULL DEFAULT 12,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalGate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutonomyPolicy" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT,
    "contentType" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'APPROVAL',
    "allowedTools" JSONB NOT NULL,
    "budgetCredits" INTEGER NOT NULL DEFAULT 40,
    "requiredApprovals" JSONB NOT NULL,
    "escalationRules" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutonomyPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FailureRecord" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "dailyPlanId" TEXT,
    "agentRunId" TEXT,
    "node" TEXT NOT NULL,
    "failureClass" TEXT NOT NULL,
    "provider" TEXT,
    "promptConfigHash" TEXT,
    "customerImpact" TEXT NOT NULL,
    "repair" JSONB,
    "costCredits" INTEGER NOT NULL DEFAULT 0,
    "resolvedVersion" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "FailureRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceObservation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "postId" TEXT,
    "publishJobId" TEXT,
    "outputAssetId" TEXT,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "creativeAttributes" JSONB NOT NULL,
    "consent" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerformanceObservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyContentPlan_workspaceId_status_planDate_idx" ON "DailyContentPlan"("workspaceId", "status", "planDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyContentPlan_workspaceId_brandId_planDate_key" ON "DailyContentPlan"("workspaceId", "brandId", "planDate");

-- CreateIndex
CREATE INDEX "CreativeRequest_workspaceId_status_createdAt_idx" ON "CreativeRequest"("workspaceId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CreativeRequest_workspaceId_requestedDate_idx" ON "CreativeRequest"("workspaceId", "requestedDate");

-- CreateIndex
CREATE UNIQUE INDEX "CreativeRequest_workspaceId_idempotencyKey_key" ON "CreativeRequest"("workspaceId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "AgentRun_workspaceId_dailyPlanId_createdAt_idx" ON "AgentRun"("workspaceId", "dailyPlanId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRun_workspaceId_agentType_status_idx" ON "AgentRun"("workspaceId", "agentType", "status");

-- CreateIndex
CREATE INDEX "CreativePlan_workspaceId_dailyPlanId_status_idx" ON "CreativePlan"("workspaceId", "dailyPlanId", "status");

-- CreateIndex
CREATE INDEX "ApprovalGate_workspaceId_state_expiresAt_idx" ON "ApprovalGate"("workspaceId", "state", "expiresAt");

-- CreateIndex
CREATE INDEX "ApprovalGate_workspaceId_dailyPlanId_idx" ON "ApprovalGate"("workspaceId", "dailyPlanId");

-- CreateIndex
CREATE INDEX "AutonomyPolicy_workspaceId_brandId_status_idx" ON "AutonomyPolicy"("workspaceId", "brandId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AutonomyPolicy_workspaceId_brandId_contentType_channel_vers_key" ON "AutonomyPolicy"("workspaceId", "brandId", "contentType", "channel", "version");

-- CreateIndex
CREATE INDEX "FailureRecord_workspaceId_status_createdAt_idx" ON "FailureRecord"("workspaceId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "FailureRecord_workspaceId_dailyPlanId_idx" ON "FailureRecord"("workspaceId", "dailyPlanId");

-- CreateIndex
CREATE INDEX "PerformanceObservation_workspaceId_metric_windowStart_idx" ON "PerformanceObservation"("workspaceId", "metric", "windowStart");

-- CreateIndex
CREATE INDEX "PerformanceObservation_workspaceId_postId_idx" ON "PerformanceObservation"("workspaceId", "postId");

-- AddForeignKey
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyContentPlan" ADD CONSTRAINT "DailyContentPlan_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyContentPlan" ADD CONSTRAINT "DailyContentPlan_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyContentPlan" ADD CONSTRAINT "DailyContentPlan_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyContentPlan" ADD CONSTRAINT "DailyContentPlan_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeRequest" ADD CONSTRAINT "CreativeRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeRequest" ADD CONSTRAINT "CreativeRequest_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeRequest" ADD CONSTRAINT "CreativeRequest_dailyPlanId_fkey" FOREIGN KEY ("dailyPlanId") REFERENCES "DailyContentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeRequest" ADD CONSTRAINT "CreativeRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_dailyPlanId_fkey" FOREIGN KEY ("dailyPlanId") REFERENCES "DailyContentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_creativeRequestId_fkey" FOREIGN KEY ("creativeRequestId") REFERENCES "CreativeRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_parentRunId_fkey" FOREIGN KEY ("parentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativePlan" ADD CONSTRAINT "CreativePlan_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativePlan" ADD CONSTRAINT "CreativePlan_dailyPlanId_fkey" FOREIGN KEY ("dailyPlanId") REFERENCES "DailyContentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativePlan" ADD CONSTRAINT "CreativePlan_creativeRequestId_fkey" FOREIGN KEY ("creativeRequestId") REFERENCES "CreativeRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalGate" ADD CONSTRAINT "ApprovalGate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalGate" ADD CONSTRAINT "ApprovalGate_dailyPlanId_fkey" FOREIGN KEY ("dailyPlanId") REFERENCES "DailyContentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalGate" ADD CONSTRAINT "ApprovalGate_creativePlanId_fkey" FOREIGN KEY ("creativePlanId") REFERENCES "CreativePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalGate" ADD CONSTRAINT "ApprovalGate_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutonomyPolicy" ADD CONSTRAINT "AutonomyPolicy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutonomyPolicy" ADD CONSTRAINT "AutonomyPolicy_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutonomyPolicy" ADD CONSTRAINT "AutonomyPolicy_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FailureRecord" ADD CONSTRAINT "FailureRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FailureRecord" ADD CONSTRAINT "FailureRecord_dailyPlanId_fkey" FOREIGN KEY ("dailyPlanId") REFERENCES "DailyContentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FailureRecord" ADD CONSTRAINT "FailureRecord_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceObservation" ADD CONSTRAINT "PerformanceObservation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
