-- CreateTable
CREATE TABLE "ContentCalendarEntry" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT,
    "dailyPlanId" TEXT,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "contentType" TEXT NOT NULL,
    "pillar" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'AUTOPILOT',
    "metadata" JSONB,
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentCalendarEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyWorkItem" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT,
    "dailyPlanId" TEXT,
    "calendarEntryId" TEXT,
    "title" TEXT NOT NULL,
    "clientName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'INTERNAL_REVIEW',
    "deadline" TIMESTAMP(3),
    "revisionCount" INTEGER NOT NULL DEFAULT 0,
    "turnaroundHours" DOUBLE PRECISION,
    "costCredits" INTEGER NOT NULL DEFAULT 0,
    "providerSpendMinor" INTEGER NOT NULL DEFAULT 0,
    "revenueMinor" INTEGER,
    "marginMinor" INTEGER,
    "blockedReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgencyWorkItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentCalendarEntry_workspaceId_brandId_entryDate_idx" ON "ContentCalendarEntry"("workspaceId", "brandId", "entryDate");

-- CreateIndex
CREATE INDEX "ContentCalendarEntry_workspaceId_status_entryDate_idx" ON "ContentCalendarEntry"("workspaceId", "status", "entryDate");

-- CreateIndex
CREATE UNIQUE INDEX "ContentCalendarEntry_workspaceId_entryDate_contentType_key" ON "ContentCalendarEntry"("workspaceId", "entryDate", "contentType");

-- CreateIndex
CREATE INDEX "AgencyWorkItem_workspaceId_status_deadline_idx" ON "AgencyWorkItem"("workspaceId", "status", "deadline");

-- CreateIndex
CREATE INDEX "AgencyWorkItem_workspaceId_brandId_updatedAt_idx" ON "AgencyWorkItem"("workspaceId", "brandId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgencyWorkItem_workspaceId_dailyPlanId_key" ON "AgencyWorkItem"("workspaceId", "dailyPlanId");

-- AddForeignKey
ALTER TABLE "ContentCalendarEntry" ADD CONSTRAINT "ContentCalendarEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentCalendarEntry" ADD CONSTRAINT "ContentCalendarEntry_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentCalendarEntry" ADD CONSTRAINT "ContentCalendarEntry_dailyPlanId_fkey" FOREIGN KEY ("dailyPlanId") REFERENCES "DailyContentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyWorkItem" ADD CONSTRAINT "AgencyWorkItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyWorkItem" ADD CONSTRAINT "AgencyWorkItem_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyWorkItem" ADD CONSTRAINT "AgencyWorkItem_dailyPlanId_fkey" FOREIGN KEY ("dailyPlanId") REFERENCES "DailyContentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
