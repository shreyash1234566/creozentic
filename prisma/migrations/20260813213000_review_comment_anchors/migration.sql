ALTER TABLE "Comment"
  ADD COLUMN "parentId" TEXT,
  ADD COLUMN "anchor" JSONB,
  ADD COLUMN "mentions" JSONB;

ALTER TABLE "Comment"
  ADD CONSTRAINT "Comment_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Comment_parentId_createdAt_idx" ON "Comment"("parentId", "createdAt");
