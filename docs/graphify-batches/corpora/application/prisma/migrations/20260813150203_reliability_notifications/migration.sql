-- AlterTable
ALTER TABLE "BatchRow" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastAttemptAt" TIMESTAMP(3),
ADD COLUMN     "retryLimit" INTEGER NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "recipientId" TEXT,
    "type" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'IN_APP',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "payload" JSONB,
    "idempotencyKey" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "error" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeadLetterJob" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "runId" TEXT,
    "batchId" TEXT,
    "payload" JSONB NOT NULL,
    "error" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "idempotencyKey" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeadLetterJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_workspaceId_recipientId_status_createdAt_idx" ON "Notification"("workspaceId", "recipientId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_workspaceId_idempotencyKey_key" ON "Notification"("workspaceId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "DeadLetterJob_workspaceId_status_createdAt_idx" ON "DeadLetterJob"("workspaceId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "DeadLetterJob_workspaceId_runId_idx" ON "DeadLetterJob"("workspaceId", "runId");

-- CreateIndex
CREATE UNIQUE INDEX "DeadLetterJob_workspaceId_idempotencyKey_key" ON "DeadLetterJob"("workspaceId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeadLetterJob" ADD CONSTRAINT "DeadLetterJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
