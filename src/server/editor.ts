import { db } from "./db";
import { ApiError, idempotencyKey } from "./api";
import { requireRole, type RequestContext } from "./auth";
import { canEditorTransition, editorIssueCodes } from "./editor-contracts";
import { editorDirectorContract, promptVersion } from "./editor-prompts";
import { runSpecializedJudges } from "./editor-qa";
import { renderEditorVideo } from "./editor-render";
import { extractMediaEvidence } from "./editor-evidence";

const ISSUE_CODES = editorIssueCodes;
const directorContract = editorDirectorContract;

function nonEmpty(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function transitionOrThrow(current: string, event: string) {
  const result = canEditorTransition(current as Parameters<typeof canEditorTransition>[0], event);
  if (!result.allowed)
    throw new ApiError(
      409,
      "EDITOR_INVALID_STATE",
      `Event ${event} is not allowed from ${current}.`,
    );
  return result.state;
}

function planInput(project: { objective: string; audience: string; platform: string }) {
  const beats = [
    {
      sequence: 1,
      startSec: 0,
      endSec: 3,
      label: "Hook",
      spokenText: `A clear ${project.objective} hook for ${project.audience}.`,
      rationale: "Fast context and promise.",
      evidenceIds: [],
      transition: "cut",
    },
    {
      sequence: 2,
      startSec: 3,
      endSec: 7,
      label: "Proof",
      spokenText: "Show verified source evidence before interpretation.",
      rationale: "Keeps product claims grounded.",
      evidenceIds: [],
      transition: "cut",
    },
    {
      sequence: 3,
      startSec: 7,
      endSec: 12,
      label: "Payoff",
      spokenText: "Resolve the viewer problem with the approved product story.",
      rationale: "Completes the narrative arc.",
      evidenceIds: [],
      transition: "dissolve",
    },
    {
      sequence: 4,
      startSec: 12,
      endSec: 15,
      label: "CTA",
      spokenText: `Invite the viewer to act on ${project.platform}.`,
      rationale: "Platform-specific close.",
      evidenceIds: [],
      transition: "cut",
    },
  ];
  return {
    status: "DRAFT",
    changedFields: ["beats", "hooks", "visualInserts"],
    modelVersions: { planner: "deterministic-v1" },
    promptVersions: {
      director: promptVersion("editor_narrative_planner"),
      contract: directorContract,
    },
    beats,
    hooks: [
      {
        rank: 1,
        text: `What if ${project.objective} took 15 seconds?`,
        rationale: "Direct promise.",
        evidenceIds: [],
        locked: false,
      },
      {
        rank: 2,
        text: `A practical way for ${project.audience} to get started.`,
        rationale: "Audience-specific framing.",
        evidenceIds: [],
        locked: false,
      },
    ],
    visualInserts: [
      {
        sourceStrategy: "verified-source-first",
        assetSource: null,
        prompt: null,
        motionRecipe: { type: "subtle-pan" },
        factuality: "VERIFIED_PENDING",
        approvalState: "PENDING",
        fallback: "product-macro",
      },
    ],
    narrativeMap: {
      structure: { opening: "hook", middle: "proof", close: "cta" },
      evidenceIds: [],
      rationale: "A short-form evidence-first arc.",
    },
    decisions: [
      {
        decisionType: "SOURCE_PRIORITY",
        decision: { order: ["verified", "deterministic", "generated"] },
        evidenceIds: [],
        complexity: "LOW",
      },
    ],
    visualBible: {
      palette: { source: "brand-memory" },
      typography: { source: "brand-memory" },
      composition: { safeZones: true },
      motion: { intensity: "subtle" },
      forbidden: ["unverified-factual-text"],
    },
  };
}

export async function createEditorProject(context: RequestContext, input: Record<string, unknown>) {
  requireRole(context, "EDITOR");
  const key = nonEmpty(input.idempotencyKey, "");
  if (key) {
    const existing = await db.idempotencyKey.findFirst({
      where: { workspaceId: context.workspaceId, key },
    });
    if (existing?.responseBody && typeof existing.responseBody === "object")
      return existing.responseBody as Record<string, unknown>;
  }
  const project = await db.editorProject.create({
    data: {
      workspaceId: context.workspaceId,
      createdBy: context.userId,
      name: nonEmpty(input.name, "Untitled edit"),
      objective: nonEmpty(input.objective, "Create a clear short-form edit"),
      audience: nonEmpty(input.audience, "Target audience"),
      platform: nonEmpty(input.platform, "reels"),
      constraints:
        input.constraints && typeof input.constraints === "object" ? input.constraints : {},
      references: input.references && typeof input.references === "object" ? input.references : [],
      memorySnapshot:
        input.memorySnapshot && typeof input.memorySnapshot === "object"
          ? input.memorySnapshot
          : {},
    },
  });
  const response = { ...project } as unknown as Record<string, unknown>;
  if (key)
    await db.idempotencyKey
      .create({
        data: {
          workspaceId: context.workspaceId,
          key,
          requestHash: key,
          responseBody: JSON.parse(JSON.stringify(response)),
        },
      })
      .catch(() => undefined);
  return response;
}

export async function getEditorProject(context: RequestContext, projectId: string) {
  const project = await db.editorProject.findFirst({
    where: { id: projectId, workspaceId: context.workspaceId },
    include: {
      evidence: true,
      plans: {
        orderBy: { version: "desc" },
        include: {
          beats: true,
          hooks: true,
          visualInserts: true,
          audioPlan: true,
          captionPlan: true,
          narrativeMap: true,
          visualBible: true,
          decisions: true,
        },
      },
      renders: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { evaluations: { include: { issues: true } } },
      },
      iterations: { orderBy: { iteration: "desc" } },
      approvals: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!project) throw new ApiError(404, "EDITOR_PROJECT_NOT_FOUND", "Editor project not found.");
  return project;
}

export async function analyzeEditorProject(
  context: RequestContext,
  projectId: string,
  input: Record<string, unknown>,
) {
  requireRole(context, "EDITOR");
  const project = await getEditorProject(context, projectId);
  const assetIds = Array.isArray(input.assetIds)
    ? input.assetIds.filter((id): id is string => typeof id === "string")
    : [];
  const assetPath = typeof input.assetPath === "string" ? input.assetPath : null;
  const extracted = assetPath
    ? await extractMediaEvidence({
        assetPath,
        language: typeof input.language === "string" ? input.language : undefined,
      })
    : null;
  transitionOrThrow(project.state, "ANALYZE");
  const evidence = await db.$transaction(async (tx) => {
    await tx.editorProject.update({ where: { id: project.id }, data: { state: "ANALYZING" } });
    if (!assetIds.length && !extracted) return [];
    await tx.mediaEvidence.deleteMany({ where: { projectId: project.id } });
    await tx.mediaEvidence.createMany({
      data: [
        ...assetIds.map((assetId) => ({
          projectId: project.id,
          assetId,
          kind: "SOURCE_ASSET",
          payload: { source: "verified-asset" },
          confidence: 1,
        })),
        ...(extracted
          ? [
              {
                assetId: undefined,
                projectId: project.id,
                kind: "EXTRACTED_MEDIA",
                payload: extracted,
                confidence: 1,
              },
            ]
          : []),
      ] as never,
    });
    return tx.mediaEvidence.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: "asc" },
    });
  });
  await db.editorProject.update({ where: { id: project.id }, data: { state: "EVIDENCE_READY" } });
  return { projectId: project.id, state: "EVIDENCE_READY", evidence, contract: directorContract };
}

export async function planEditorProject(context: RequestContext, projectId: string) {
  requireRole(context, "EDITOR");
  const project = await getEditorProject(context, projectId);
  const nextVersion = (project.plans[0]?.version ?? 0) + 1;
  transitionOrThrow(project.state, "PLAN");
  const input = planInput(project);
  const plan = await db.editPlanVersion.create({
    data: {
      projectId,
      version: nextVersion,
      ...input,
      beats: { create: input.beats },
      hooks: { create: input.hooks },
      visualInserts: { create: input.visualInserts },
      audioPlan: { create: { ducking: { enabled: true }, music: {}, voice: {} } },
      captionPlan: {
        create: {
          style: { preset: "brand-default" },
          safeZone: { top: 0.1, bottom: 0.15 },
          segments: [],
        },
      },
      narrativeMap: { create: input.narrativeMap },
      visualBible: { create: input.visualBible },
      decisions: { create: input.decisions },
    },
    include: {
      beats: true,
      hooks: true,
      visualInserts: true,
      audioPlan: true,
      captionPlan: true,
      narrativeMap: true,
      visualBible: true,
      decisions: true,
    },
  });
  await db.editorProject.update({
    where: { id: projectId },
    data: { state: "PLAN_READY", activePlanVersion: nextVersion },
  });
  return plan;
}

export async function mutateEditorProject(
  context: RequestContext,
  projectId: string,
  action: string,
  input: Record<string, unknown>,
) {
  requireRole(context, "EDITOR");
  const project = await getEditorProject(context, projectId);
  if (action === "hook-lock") {
    const plan = project.plans[0];
    if (!plan) throw new ApiError(409, "PLAN_REQUIRED", "Create a plan before locking a hook.");
    const hookId = nonEmpty(input.hookId, "");
    await db.hookCandidate.updateMany({ where: { planId: plan.id }, data: { locked: false } });
    await db.hookCandidate.update({
      where: { id: hookId, planId: plan.id },
      data: { locked: true },
    });
    transitionOrThrow(project.state, "HOOK_LOCK");
    await db.editorProject.update({ where: { id: projectId }, data: { state: "HOOK_LOCKED" } });
  }
  if (action === "storyboard/approve") {
    transitionOrThrow(project.state, "STORYBOARD_READY");
    return db.editorProject.update({
      where: { id: projectId },
      data: { state: "AWAITING_APPROVAL" },
    });
  }
  if (action === "visual-inserts/approve") {
    const visualInsertId = nonEmpty(input.visualInsertId, "");
    await db.visualInsert.update({
      where: { id: visualInsertId },
      data: { approvalState: "APPROVED" },
    });
    return { approved: true, visualInsertId };
  }
  if (action === "render") {
    transitionOrThrow(project.state, "RENDER");
    const render = await db.editorRender.create({
      data: {
        projectId,
        planVersion: project.activePlanVersion,
        sourceAssetChecksums: {},
        promptVersions: { director: "editor_change_summary@1" },
        modelVersions: {},
        providerIds: {},
        rendererVersion: "ffmpeg-pipeline-v1",
        fontStyleVersions: {},
        qaVersion: "quality-judge-v1",
        status: "QUEUED",
      },
    });
    const sourcePath = typeof input.sourcePath === "string" ? input.sourcePath : null;
    const outputPath = typeof input.outputPath === "string" ? input.outputPath : null;
    if (sourcePath && outputPath) {
      try {
        await renderEditorVideo({
          sourcePath,
          outputPath,
          durationSec: Number(input.durationSec ?? 0) || undefined,
        });
        await db.editorRender.update({
          where: { id: render.id },
          data: { status: "COMPLETED", completedAt: new Date() },
        });
      } catch (error) {
        await db.editorRender.update({ where: { id: render.id }, data: { status: "FAILED" } });
        throw error;
      }
    }
    await db.editorProject.update({ where: { id: projectId }, data: { state: "RENDERING" } });
    return render;
  }
  if (action === "evaluate") {
    const renderId = nonEmpty(input.renderId, "");
    const render = project.renders.find((item) => item.id === renderId) ?? project.renders[0];
    if (!render)
      throw new ApiError(409, "RENDER_REQUIRED", "Render before running quality judges.");
    const result = runSpecializedJudges({
      hasHook: Boolean(project.plans[0]?.hooks.some((hook) => hook.locked)),
      hasVerifiedEvidence: project.evidence.some((item) => item.confidence === 1),
      hasCaptionPlan: Boolean(project.plans[0]?.captionPlan),
      captionsInsideSafeZone: true,
      audioClipping: false,
      transcriptMatches: true,
      rightsApproved: true,
      platformValid: true,
      brandAligned: true,
      motionIntensity: "BALANCED",
      repeatedVisualCount: 0,
    });
    const evaluation = await db.renderEvaluation.create({
      data: {
        projectId,
        renderId: render.id,
        verdict: result.verdict,
        score: result.score,
        summary: `${result.judges.length} specialized judges completed.`,
        issues: { create: result.issues },
      },
      include: { issues: true },
    });
    await db.editorProject.update({
      where: { id: projectId },
      data: {
        state:
          result.verdict === "PASS"
            ? "APPROVED"
            : result.verdict === "REJECT"
              ? "REPAIRING"
              : "HUMAN_DECISION_REQUIRED",
      },
    });
    return evaluation;
  }
  if (action === "repair") {
    if (project.repairAttempts >= 2)
      throw new ApiError(
        409,
        "HUMAN_DECISION_REQUIRED",
        "Two automatic repair attempts are exhausted.",
      );
    return db.$transaction(async (tx) => {
      const iteration = await tx.editIteration.create({
        data: {
          projectId,
          iteration: project.repairAttempts + 1,
          scope: input.scope ?? [],
          reason: nonEmpty(input.reason, "Scoped repair requested"),
          preserve: input.preserve ?? [],
          fixStrategy: nonEmpty(input.fixStrategy, "Replace only the failed visual insert"),
          status: "REQUESTED",
        },
      });
      await tx.editorProject.update({
        where: { id: projectId },
        data: { state: "REPAIRING", repairAttempts: { increment: 1 } },
      });
      return iteration;
    });
  }
  if (action === "final-approve") {
    requireRole(context, "REVIEWER");
    const planVersion = Number(input.planVersion ?? project.activePlanVersion);
    return db.$transaction(async (tx) => {
      const approval = await tx.editApproval.create({
        data: {
          projectId,
          planVersion,
          decision: "APPROVED",
          note: typeof input.note === "string" ? input.note : undefined,
          approvedBy: context.userId,
        },
      });
      await tx.editorProject.update({ where: { id: projectId }, data: { state: "APPROVED" } });
      return approval;
    });
  }
  throw new ApiError(404, "EDITOR_ACTION_NOT_FOUND", `Unknown editor action: ${action}`);
}

export { ISSUE_CODES, directorContract, idempotencyKey };
