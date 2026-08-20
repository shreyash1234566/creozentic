ALTER TABLE "UGCProject" ADD COLUMN "campaignId" TEXT;

CREATE INDEX "UGCProject_workspaceId_campaignId_updatedAt_idx"
  ON "UGCProject"("workspaceId", "campaignId", "updatedAt");

ALTER TABLE "UGCProject"
  ADD CONSTRAINT "UGCProject_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
