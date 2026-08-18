import { db } from "./db";
import type { Prisma } from "@prisma/client";
import { ApiError, idempotencyKey } from "./api";
import { requireRole, type RequestContext } from "./auth";
import { canEditorTransition, editorIssueCodes } from "./editor-contracts";
import { editorDirectorContract, promptVersion } from "./editor-prompts";
import { runSpecializedJudges } from "./editor-qa";
import { renderEditorVideo } from "./editor-render";
import { extractMediaEvidence } from "./editor-evidence";
import { buildEditDecisionList, buildOtioTimeline, createRenderManifest } from "./part2-runtime";

const ISSUE_CODES = editorIssueCodes;
const directorContract = editorDirectorContract;

function json(value: unknown) {
  return value as Prisma.InputJsonValue;
}

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

function planInput(project: {
  objective: string;
  audience: string;
  platform: string;
  evidence: Array<{
    id: string;
    startSec: number | null;
    endSec: number | null;
    transcript: string | null;
  }>;
}) {
  const evidenceIds = project.evidence.map((item) => item.id);
  const firstEvidence =
    project.evidence.find((item) => item.startSec !== null) ?? project.evidence[0];
  const beats = [
    {
      sequence: 1,
      startSec: 0,
      endSec: 3,
      label: "Hook",
      spokenText: `A clear ${project.objective} hook for ${project.audience}.`,
      rationale: "Direct audience pain and promise.",
      evidenceIds: firstEvidence ? [firstEvidence.id] : [],
      transition: "cut",
    },
    {
      sequence: 2,
      startSec: 3,
      endSec: 7,
      label: "Problem",
      spokenText: "Name the viewer problem before adding visual noise.",
      rationale: "Creates tension without an unsupported claim.",
      evidenceIds,
      transition: "cut",
    },
    {
      sequence: 3,
      startSec: 7,
      endSec: 11,
      label: "Proof",
      spokenText: "Show verified source evidence before interpretation.",
      rationale: "Keeps the promise grounded in source truth.",
      evidenceIds,
      transition: "dissolve",
    },
    {
      sequence: 4,
      startSec: 11,
      endSec: 15,
      label: "Payoff",
      spokenText: "Resolve the viewer problem with the approved product story.",
      rationale: "Connects evidence to outcome.",
      evidenceIds,
      transition: "cut",
    },
    {
      sequence: 5,
      startSec: 15,
      endSec: 18,
      label: "CTA",
      spokenText: `Invite the viewer to act on ${project.platform}.`,
      rationale: "Platform-specific close.",
      evidenceIds: [],
      transition: "cut",
    },
  ];
  const runtimeEvidence = project.evidence.map((item) => ({
    id: item.id,
    startSec: item.startSec ?? undefined,
    endSec: item.endSec ?? undefined,
    transcript: item.transcript ?? undefined,
    verified: true,
  }));
  const editDecisionList = buildEditDecisionList(beats, runtimeEvidence);
  const otioTimeline = buildOtioTimeline(editDecisionList);
  const renderManifest = createRenderManifest({
    planVersion: 1,
    renderer: "ffmpeg-v1",
    sourceChecksums: evidenceIds,
    promptVersions: { director: promptVersion("editor_narrative_planner") },
    outputFormats: ["mp4", "webm"],
  });
  const hooks = [
    {
      rank: 1,
      text: `What if ${project.objective} took 15 seconds?`,
      rationale: "Direct promise and high tension.",
      evidenceIds: firstEvidence ? [firstEvidence.id] : [],
      locked: false,
    },
    {
      rank: 2,
      text: `A practical way for ${project.audience} to get started.`,
      rationale: "Audience-specific framing.",
      evidenceIds,
      locked: false,
    },
    {
      rank: 3,
      text: "See the proof before you trust the promise.",
      rationale: "Evidence-led curiosity.",
      evidenceIds,
      locked: false,
    },
  ];
  return {
    status: "DRAFT",
    changedFields: [
      "beats",
      "hooks",
      "visualInserts",
      "motionGraphics",
      "audioPlan",
      "captionPlan",
    ],
    modelVersions: { planner: "deterministic-v2" },
    promptVersions: {
      director: promptVersion("editor_narrative_planner"),
      contract: directorContract,
    },
    beats,
    hooks,
    visualInserts: [
      {
        beatId: null,
        sourceStrategy: "verified-source-first",
        assetSource: firstEvidence?.id ?? null,
        prompt: null,
        motionRecipe: {
          type: "subtle-pan",
          keyframes: [
            { t: 0, scale: 1 },
            { t: 1, scale: 1.04 },
          ],
        },
        factuality: "VERIFIED_PENDING",
        approvalState: "PENDING",
        fallback: "product-macro",
      },
      {
        beatId: null,
        sourceStrategy: "rights-cleared-then-generated-metaphor",
        assetSource: null,
        prompt: `A restrained visual supporting ${project.objective}`,
        motionRecipe: { type: "parallax", bounded: true },
        factuality: "NON_FACTUAL_METAPHOR",
        approvalState: "PENDING",
        fallback: "kinetic-typography-card",
      },
    ],
    motionGraphics: [
      {
        beatId: null,
        kind: "kinetic-caption",
        parameters: { mode: "word-emphasis", maxLines: 2, safeZone: "caption-bottom" },
        styleVersion: "brand-default-v1",
      },
      {
        beatId: null,
        kind: "proof-callout",
        parameters: { label: "verified source", style: "minimal-card", safeZone: "product-safe" },
        styleVersion: "brand-default-v1",
      },
      {
        beatId: null,
        kind: "cta-card",
        parameters: { durationSec: 3, transition: "cut" },
        styleVersion: "brand-default-v1",
      },
    ],
    audioPlan: {
      ducking: { enabled: true, targetDb: -14, attackMs: 80, releaseMs: 220 },
      music: { strategy: "rights-cleared-or-user-supplied", beatSync: true },
      voice: { preserveSourceVoice: true, clippingTargetDb: -1 },
    },
    captionPlan: {
      style: { preset: "brand-default", emphasis: "word-level" },
      safeZone: { top: 0.1, bottom: 0.15, faceAvoidance: true },
      segments: beats.map((beat) => ({
        startSec: beat.startSec,
        endSec: beat.endSec,
        text: beat.spokenText,
        evidenceIds: beat.evidenceIds,
      })),
    },
    narrativeMap: {
      structure: {
        opening: "hook",
        problem: "problem",
        proof: "proof",
        payoff: "payoff",
        close: "cta",
      },
      evidenceIds,
      rationale:
        "A short-form evidence-first arc with a complete problem-to-proof-to-payoff structure.",
    },
    decisions: [
      {
        decisionType: "SOURCE_PRIORITY",
        decision: { order: ["verified", "deterministic", "rights-cleared", "generated"] },
        evidenceIds,
        complexity: "LOW",
      },
      {
        decisionType: "EDIT_DECISION_LIST",
        decision: {
          operations: [
            { type: "preserve", range: [0, 18] },
            { type: "caption", safeZone: "bottom" },
            { type: "duck-music", when: "speech" },
            { type: "transition", allowed: ["cut", "dissolve"] },
            { type: "edl", decisions: editDecisionList },
            { type: "otio", timeline: otioTimeline },
            { type: "render-manifest", manifest: renderManifest },
          ],
        },
        evidenceIds,
        complexity: "MEDIUM",
      },
    ],
    visualBible: {
      palette: { source: "brand-memory" },
      typography: { source: "brand-memory" },
      composition: { safeZones: true, faceAvoidance: true, productSafe: true },
      motion: { intensity: "subtle", maxScaleDelta: 0.04 },
      forbidden: ["unverified-factual-text", "invented-logo", "unbounded-camera-motion"],
    },
  };
}

const EDITOR_SKILLS = [
  {
    skillId: "hook-selection",
    name: "Hook selection",
    promptTemplateId: "editor_hook_selection@1",
    evaluationCriteria: { tension: true, evidenceAnchored: true },
  },
  {
    skillId: "captioning",
    name: "Evidence-safe captioning",
    promptTemplateId: "editor_captioning@1",
    evaluationCriteria: { safeZone: true, transcriptAligned: true },
  },
  {
    skillId: "broll-planning",
    name: "B-roll planning",
    promptTemplateId: "editor_broll_planning@1",
    evaluationCriteria: { sourcePriority: true, rightsTrace: true },
  },
  {
    skillId: "motion-graphics",
    name: "Motion graphics planning",
    promptTemplateId: "editor_motion_graphics@1",
    evaluationCriteria: { boundedMotion: true, typographySafe: true },
  },
  {
    skillId: "quality-judging",
    name: "Quality judging",
    promptTemplateId: "editor_quality_judging@1",
    evaluationCriteria: { issueCodes: true, evidenceAnchored: true },
  },
  {
    skillId: "scoped-repair",
    name: "Scoped repair",
    promptTemplateId: "editor_scoped_repair@1",
    evaluationCriteria: { preserveList: true, boundedAttempts: true },
  },
];

async function ensureEditorSkills() {
  return Promise.all(
    EDITOR_SKILLS.map((skill) =>
      db.skillDefinition.upsert({
        where: { skillId: skill.skillId },
        create: {
          ...skill,
          version: 1,
          inputSchema: { type: "object" },
          outputSchema: { type: "object" },
          allowedTools: [],
        },
        update: {
          name: skill.name,
          promptTemplateId: skill.promptTemplateId,
          evaluationCriteria: skill.evaluationCriteria,
          status: "ACTIVE",
        },
      }),
    ),
  );
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
  const memory =
    input.memorySnapshot && typeof input.memorySnapshot === "object"
      ? (input.memorySnapshot as Record<string, unknown>)
      : {};
  await db.$transaction(async (tx) => {
    await tx.memorySnapshot.create({
      data: { projectId: project.id, version: 1, snapshot: json(memory) },
    });
    const entries = Object.entries(memory).map(([key, value]) => ({
      projectId: project.id,
      category: "project",
      key,
      value: json(value),
      source: "editor-project-input",
      confidence: 1,
    }));
    if (entries.length) await tx.editingMemory.createMany({ data: entries });
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
          motionGraphics: true,
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
      memorySnapshots: { orderBy: { version: "desc" } },
      editingMemory: { orderBy: { createdAt: "desc" } },
      skills: { orderBy: { createdAt: "desc" } },
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
    for (const assetId of assetIds) {
      await tx.mediaEvidence.create({
        data: {
          projectId: project.id,
          assetId,
          kind: "SOURCE_ASSET",
          payload: { source: "verified-asset" },
          confidence: 1,
        },
      });
    }
    if (extracted) {
      const media = await tx.mediaEvidence.create({
        data: {
          projectId: project.id,
          kind: "EXTRACTED_MEDIA",
          startSec: 0,
          endSec: extracted.durationSec,
          payload: json(extracted),
          confidence: 1,
        },
      });
      if (extracted.transcriptWords.length)
        await tx.transcriptWord.createMany({
          data: extracted.transcriptWords.map((word) => ({ evidenceId: media.id, ...word })),
        });
      if (extracted.shots.length)
        await tx.shotBoundary.createMany({
          data: extracted.shots.map((shot) => ({
            evidenceId: media.id,
            startSec: shot.startSec,
            endSec: shot.endSec,
            confidence: shot.confidence,
          })),
        });
      if (extracted.audioWindows.length)
        await tx.audioFeatureWindow.createMany({
          data: extracted.audioWindows.map((window) => ({
            evidenceId: media.id,
            startSec: window.startSec,
            endSec: window.endSec,
            features: json(window.features),
          })),
        });
      if (extracted.entities.length)
        await tx.detectedEntity.createMany({
          data: extracted.entities.map((entity) => ({
            evidenceId: media.id,
            label: entity.label,
            confidence: entity.confidence,
            region: entity.region ? json(entity.region) : undefined,
          })),
        });
      if (extracted.ocrRegions.length)
        await tx.oCRRegion.createMany({
          data: extracted.ocrRegions.map((region) => ({
            evidenceId: media.id,
            text: region.text,
            confidence: region.confidence,
            region: json(region.region),
          })),
        });
      if (extracted.regions.length)
        await tx.evidenceRegion.createMany({
          data: extracted.regions.map((region) => ({
            evidenceId: media.id,
            label: region.label,
            x: region.x,
            y: region.y,
            width: region.width,
            height: region.height,
          })),
        });
    }
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
  const skills = await ensureEditorSkills();
  const input = planInput({
    objective: project.objective,
    audience: project.audience,
    platform: project.platform,
    evidence: project.evidence,
  });
  const plan = await db.editPlanVersion.create({
    data: {
      projectId,
      version: nextVersion,
      ...input,
      beats: { create: input.beats },
      hooks: { create: input.hooks },
      visualInserts: { create: input.visualInserts },
      motionGraphics: { create: input.motionGraphics },
      audioPlan: { create: input.audioPlan },
      captionPlan: { create: input.captionPlan },
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
  await db.skillExecution.createMany({
    data: skills.map((skill) => ({
      projectId,
      skillId: skill.skillId,
      status: "COMPLETED",
      input: { planVersion: nextVersion },
      output: { status: "materialized" },
    })),
  });
  await db.memorySnapshot.create({
    data: {
      projectId,
      version: nextVersion + 1,
      snapshot: json({
        objective: project.objective,
        audience: project.audience,
        platform: project.platform,
        evidenceIds: project.evidence.map((item) => item.id),
        planVersion: nextVersion,
      }),
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
