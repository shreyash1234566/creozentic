-- CreateTable
CREATE TABLE "DailyPublicationJob" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "dailyPlanId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "entryKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "platformObjectId" TEXT,
    "destination" TEXT,
    "mediaChecksum" TEXT,
    "metadataHash" TEXT,
    "confirmation" JSONB NOT NULL,
    "receipt" JSONB,
    "error" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyPublicationJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyPublicationJob_workspaceId_dailyPlanId_status_idx" ON "DailyPublicationJob"("workspaceId", "dailyPlanId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DailyPublicationJob_workspaceId_idempotencyKey_key" ON "DailyPublicationJob"("workspaceId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "DailyPublicationJob" ADD CONSTRAINT "DailyPublicationJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyPublicationJob" ADD CONSTRAINT "DailyPublicationJob_dailyPlanId_fkey" FOREIGN KEY ("dailyPlanId") REFERENCES "DailyContentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyPublicationJob" ADD CONSTRAINT "DailyPublicationJob_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "Connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
