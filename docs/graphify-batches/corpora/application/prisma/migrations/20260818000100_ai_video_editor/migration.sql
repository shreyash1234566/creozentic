-- CreateTable
CREATE TABLE "EditorProject" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'DRAFT',
    "objective" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "constraints" JSONB NOT NULL,
    "references" JSONB NOT NULL,
    "memorySnapshot" JSONB NOT NULL,
    "activePlanVersion" INTEGER NOT NULL DEFAULT 0,
    "repairAttempts" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EditorProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaEvidence" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "assetId" TEXT,
    "kind" TEXT NOT NULL,
    "startSec" DOUBLE PRECISION,
    "endSec" DOUBLE PRECISION,
    "transcript" TEXT,
    "confidence" DOUBLE PRECISION,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditPlanVersion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "parentVersionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "changeReason" TEXT,
    "changedFields" JSONB NOT NULL,
    "estimatedCost" INTEGER NOT NULL DEFAULT 0,
    "actualCost" INTEGER,
    "modelVersions" JSONB NOT NULL,
    "promptVersions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EditPlanVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NarrativeMap" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "structure" JSONB NOT NULL,
    "evidenceIds" JSONB NOT NULL,
    "rationale" TEXT NOT NULL,

    CONSTRAINT "NarrativeMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditDecision" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "beatId" TEXT,
    "decisionType" TEXT NOT NULL,
    "decision" JSONB NOT NULL,
    "evidenceIds" JSONB NOT NULL,
    "complexity" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EditDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisualBible" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "palette" JSONB NOT NULL,
    "typography" JSONB NOT NULL,
    "composition" JSONB NOT NULL,
    "motion" JSONB NOT NULL,
    "forbidden" JSONB NOT NULL,

    CONSTRAINT "VisualBible_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditBeat" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "startSec" DOUBLE PRECISION NOT NULL,
    "endSec" DOUBLE PRECISION NOT NULL,
    "label" TEXT NOT NULL,
    "spokenText" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "evidenceIds" JSONB NOT NULL,
    "transition" TEXT NOT NULL DEFAULT 'cut',
    "approved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "EditBeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HookCandidate" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "evidenceIds" JSONB NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "HookCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisualInsert" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "beatId" TEXT,
    "sourceStrategy" TEXT NOT NULL,
    "assetSource" TEXT,
    "prompt" TEXT,
    "motionRecipe" JSONB NOT NULL,
    "factuality" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "approvalState" TEXT NOT NULL DEFAULT 'PENDING',
    "fallback" TEXT,

    CONSTRAINT "VisualInsert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MotionGraphic" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "beatId" TEXT,
    "kind" TEXT NOT NULL,
    "parameters" JSONB NOT NULL,
    "styleVersion" TEXT NOT NULL,

    CONSTRAINT "MotionGraphic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudioPlan" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "ducking" JSONB NOT NULL,
    "music" JSONB NOT NULL,
    "voice" JSONB NOT NULL,

    CONSTRAINT "AudioPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaptionPlan" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "style" JSONB NOT NULL,
    "safeZone" JSONB NOT NULL,
    "segments" JSONB NOT NULL,

    CONSTRAINT "CaptionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditorRender" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "planVersion" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "outputAssetId" TEXT,
    "sourceAssetChecksums" JSONB NOT NULL,
    "promptVersions" JSONB NOT NULL,
    "modelVersions" JSONB NOT NULL,
    "providerIds" JSONB NOT NULL,
    "rendererVersion" TEXT NOT NULL,
    "fontStyleVersions" JSONB NOT NULL,
    "qaVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "EditorRender_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RenderEvaluation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "renderId" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RenderEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationIssue" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "issueCode" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "beatId" TEXT,
    "sourceEvidenceIds" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "explanation" TEXT NOT NULL,
    "proposedFix" TEXT NOT NULL,

    CONSTRAINT "EvaluationIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditIteration" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "iteration" INTEGER NOT NULL,
    "scope" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "preserve" JSONB NOT NULL,
    "fixStrategy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EditIteration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditApproval" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "planVersion" INTEGER NOT NULL,
    "decision" TEXT NOT NULL,
    "note" TEXT,
    "approvedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EditApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillDefinition" (
    "id" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "inputSchema" JSONB NOT NULL,
    "outputSchema" JSONB NOT NULL,
    "promptTemplateId" TEXT NOT NULL,
    "allowedTools" JSONB NOT NULL,
    "evaluationCriteria" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "SkillDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillExecution" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "input" JSONB NOT NULL,
    "output" JSONB,
    "latencyMs" INTEGER,
    "costCredits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceRelation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,

    CONSTRAINT "EvidenceRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceFrame" (
    "id" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "frameSec" DOUBLE PRECISION NOT NULL,
    "imageKey" TEXT,
    "metadata" JSONB NOT NULL,

    CONSTRAINT "EvidenceFrame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceRegion" (
    "id" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "width" DOUBLE PRECISION NOT NULL,
    "height" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "EvidenceRegion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranscriptWord" (
    "id" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "startSec" DOUBLE PRECISION NOT NULL,
    "endSec" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION,

    CONSTRAINT "TranscriptWord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShotBoundary" (
    "id" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "startSec" DOUBLE PRECISION NOT NULL,
    "endSec" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION,

    CONSTRAINT "ShotBoundary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudioFeatureWindow" (
    "id" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "startSec" DOUBLE PRECISION NOT NULL,
    "endSec" DOUBLE PRECISION NOT NULL,
    "features" JSONB NOT NULL,

    CONSTRAINT "AudioFeatureWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DetectedEntity" (
    "id" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "region" JSONB,

    CONSTRAINT "DetectedEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OCRRegion" (
    "id" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "region" JSONB NOT NULL,

    CONSTRAINT "OCRRegion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemorySnapshot" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemorySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditingMemory" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EditingMemory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EditorProject_workspaceId_state_updatedAt_idx" ON "EditorProject"("workspaceId", "state", "updatedAt");

-- CreateIndex
CREATE INDEX "MediaEvidence_projectId_kind_startSec_idx" ON "MediaEvidence"("projectId", "kind", "startSec");

-- CreateIndex
CREATE INDEX "EditPlanVersion_projectId_status_idx" ON "EditPlanVersion"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EditPlanVersion_projectId_version_key" ON "EditPlanVersion"("projectId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "NarrativeMap_planId_key" ON "NarrativeMap"("planId");

-- CreateIndex
CREATE INDEX "EditDecision_planId_decisionType_idx" ON "EditDecision"("planId", "decisionType");

-- CreateIndex
CREATE UNIQUE INDEX "VisualBible_planId_key" ON "VisualBible"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "EditBeat_planId_sequence_key" ON "EditBeat"("planId", "sequence");

-- CreateIndex
CREATE INDEX "HookCandidate_planId_rank_idx" ON "HookCandidate"("planId", "rank");

-- CreateIndex
CREATE INDEX "VisualInsert_planId_approvalState_idx" ON "VisualInsert"("planId", "approvalState");

-- CreateIndex
CREATE UNIQUE INDEX "AudioPlan_planId_key" ON "AudioPlan"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "CaptionPlan_planId_key" ON "CaptionPlan"("planId");

-- CreateIndex
CREATE INDEX "EditorRender_projectId_createdAt_idx" ON "EditorRender"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "RenderEvaluation_projectId_verdict_createdAt_idx" ON "RenderEvaluation"("projectId", "verdict", "createdAt");

-- CreateIndex
CREATE INDEX "EvaluationIssue_evaluationId_severity_idx" ON "EvaluationIssue"("evaluationId", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "EditIteration_projectId_iteration_key" ON "EditIteration"("projectId", "iteration");

-- CreateIndex
CREATE INDEX "EditApproval_projectId_createdAt_idx" ON "EditApproval"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SkillDefinition_skillId_key" ON "SkillDefinition"("skillId");

-- CreateIndex
CREATE INDEX "SkillExecution_projectId_createdAt_idx" ON "SkillExecution"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "EvidenceRelation_projectId_relation_idx" ON "EvidenceRelation"("projectId", "relation");

-- CreateIndex
CREATE INDEX "TranscriptWord_evidenceId_startSec_idx" ON "TranscriptWord"("evidenceId", "startSec");

-- CreateIndex
CREATE UNIQUE INDEX "MemorySnapshot_projectId_version_key" ON "MemorySnapshot"("projectId", "version");

-- CreateIndex
CREATE INDEX "EditingMemory_projectId_category_idx" ON "EditingMemory"("projectId", "category");

-- AddForeignKey
ALTER TABLE "EditorProject" ADD CONSTRAINT "EditorProject_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaEvidence" ADD CONSTRAINT "MediaEvidence_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "EditorProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaEvidence" ADD CONSTRAINT "MediaEvidence_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditPlanVersion" ADD CONSTRAINT "EditPlanVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "EditorProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NarrativeMap" ADD CONSTRAINT "NarrativeMap_planId_fkey" FOREIGN KEY ("planId") REFERENCES "EditPlanVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditDecision" ADD CONSTRAINT "EditDecision_planId_fkey" FOREIGN KEY ("planId") REFERENCES "EditPlanVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisualBible" ADD CONSTRAINT "VisualBible_planId_fkey" FOREIGN KEY ("planId") REFERENCES "EditPlanVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditBeat" ADD CONSTRAINT "EditBeat_planId_fkey" FOREIGN KEY ("planId") REFERENCES "EditPlanVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HookCandidate" ADD CONSTRAINT "HookCandidate_planId_fkey" FOREIGN KEY ("planId") REFERENCES "EditPlanVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisualInsert" ADD CONSTRAINT "VisualInsert_planId_fkey" FOREIGN KEY ("planId") REFERENCES "EditPlanVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MotionGraphic" ADD CONSTRAINT "MotionGraphic_planId_fkey" FOREIGN KEY ("planId") REFERENCES "EditPlanVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioPlan" ADD CONSTRAINT "AudioPlan_planId_fkey" FOREIGN KEY ("planId") REFERENCES "EditPlanVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaptionPlan" ADD CONSTRAINT "CaptionPlan_planId_fkey" FOREIGN KEY ("planId") REFERENCES "EditPlanVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditorRender" ADD CONSTRAINT "EditorRender_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "EditorProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenderEvaluation" ADD CONSTRAINT "RenderEvaluation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "EditorProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenderEvaluation" ADD CONSTRAINT "RenderEvaluation_renderId_fkey" FOREIGN KEY ("renderId") REFERENCES "EditorRender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationIssue" ADD CONSTRAINT "EvaluationIssue_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "RenderEvaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditIteration" ADD CONSTRAINT "EditIteration_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "EditorProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditApproval" ADD CONSTRAINT "EditApproval_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "EditorProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillExecution" ADD CONSTRAINT "SkillExecution_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "EditorProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillExecution" ADD CONSTRAINT "SkillExecution_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "SkillDefinition"("skillId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceRelation" ADD CONSTRAINT "EvidenceRelation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "EditorProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceFrame" ADD CONSTRAINT "EvidenceFrame_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "MediaEvidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceRegion" ADD CONSTRAINT "EvidenceRegion_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "MediaEvidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscriptWord" ADD CONSTRAINT "TranscriptWord_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "MediaEvidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShotBoundary" ADD CONSTRAINT "ShotBoundary_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "MediaEvidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioFeatureWindow" ADD CONSTRAINT "AudioFeatureWindow_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "MediaEvidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetectedEntity" ADD CONSTRAINT "DetectedEntity_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "MediaEvidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OCRRegion" ADD CONSTRAINT "OCRRegion_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "MediaEvidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemorySnapshot" ADD CONSTRAINT "MemorySnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "EditorProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditingMemory" ADD CONSTRAINT "EditingMemory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "EditorProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

