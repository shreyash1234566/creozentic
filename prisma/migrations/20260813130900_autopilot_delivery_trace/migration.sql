-- AlterTable
ALTER TABLE "AgentRun" ADD COLUMN     "attempt" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "retryLimit" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "timeoutMs" INTEGER;

-- AlterTable
ALTER TABLE "CreativePlan" ADD COLUMN     "contentType" TEXT NOT NULL DEFAULT 'organic_poster';

-- AlterTable
ALTER TABLE "DailyContentPlan" ADD COLUMN     "deliveryManifest" JSONB;

-- AlterTable
ALTER TABLE "WorkflowTemplate" ADD COLUMN     "autopilotMetadata" JSONB;
