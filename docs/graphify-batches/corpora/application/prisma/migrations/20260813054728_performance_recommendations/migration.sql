-- CreateTable
CREATE TABLE "PerformanceRecommendation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "optOut" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "PerformanceRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PerformanceRecommendation_workspaceId_status_createdAt_idx" ON "PerformanceRecommendation"("workspaceId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceRecommendation_workspaceId_metric_title_key" ON "PerformanceRecommendation"("workspaceId", "metric", "title");

-- AddForeignKey
ALTER TABLE "PerformanceRecommendation" ADD CONSTRAINT "PerformanceRecommendation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
