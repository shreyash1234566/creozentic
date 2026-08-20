-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "directionSnapshot" JSONB;
ALTER TABLE "Campaign" ADD COLUMN "selectedDirectionId" TEXT;

-- CreateTable
CREATE TABLE "CampaignDirection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "promise" TEXT NOT NULL,
    "visual" TEXT NOT NULL,
    "copy" JSONB NOT NULL,
    "formats" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "selectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignDirection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CampaignDirection_campaignId_position_key" ON "CampaignDirection"("campaignId", "position");
CREATE INDEX "CampaignDirection_workspaceId_campaignId_status_idx" ON "CampaignDirection"("workspaceId", "campaignId", "status");

-- AddForeignKey
ALTER TABLE "CampaignDirection" ADD CONSTRAINT "CampaignDirection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignDirection" ADD CONSTRAINT "CampaignDirection_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
