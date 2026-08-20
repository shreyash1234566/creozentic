-- CreateTable
CREATE TABLE "CampaignBrief" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT,
    "name" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "offer" JSONB,
    "productIds" JSONB NOT NULL,
    "audience" JSONB,
    "legalCopy" JSONB,
    "channels" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "evidence" JSONB,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignBrief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateDefinition" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT,
    "name" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "schema" JSONB NOT NULL,
    "lockedLayers" JSONB NOT NULL,
    "supportedFormats" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TemplateDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignBrief_workspaceId_brandId_status_updatedAt_idx" ON "CampaignBrief"("workspaceId", "brandId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "TemplateDefinition_workspaceId_contentType_status_idx" ON "TemplateDefinition"("workspaceId", "contentType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateDefinition_workspaceId_name_version_key" ON "TemplateDefinition"("workspaceId", "name", "version");

-- AddForeignKey
ALTER TABLE "CampaignBrief" ADD CONSTRAINT "CampaignBrief_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignBrief" ADD CONSTRAINT "CampaignBrief_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateDefinition" ADD CONSTRAINT "TemplateDefinition_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateDefinition" ADD CONSTRAINT "TemplateDefinition_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
