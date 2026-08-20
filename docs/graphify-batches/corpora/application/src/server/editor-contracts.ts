import { createActor, createMachine } from "xstate";
import { z } from "zod";

export const editorStates = [
  "DRAFT",
  "ANALYZING",
  "EVIDENCE_READY",
  "PLANNING",
  "PLAN_READY",
  "HOOK_LOCKED",
  "STORYBOARD_READY",
  "AWAITING_APPROVAL",
  "RENDERING",
  "EVALUATING",
  "HUMAN_DECISION_REQUIRED",
  "REPAIRING",
  "APPROVED",
  "EXPORTED",
  "PUBLISHED",
  "CANCELLED",
  "FAILED",
] as const;
export type EditorState = (typeof editorStates)[number];

export const editorMachine = createMachine({
  id: "editor-project",
  initial: "DRAFT",
  states: {
    DRAFT: { on: { ANALYZE: "ANALYZING" } },
    ANALYZING: { on: { EVIDENCE_READY: "EVIDENCE_READY", FAILED: "FAILED" } },
    EVIDENCE_READY: { on: { PLAN: "PLANNING" } },
    PLANNING: { on: { PLAN_READY: "PLAN_READY", FAILED: "FAILED" } },
    PLAN_READY: { on: { HOOK_LOCK: "HOOK_LOCKED", STORYBOARD_READY: "STORYBOARD_READY" } },
    HOOK_LOCKED: { on: { STORYBOARD_READY: "STORYBOARD_READY" } },
    STORYBOARD_READY: { on: { APPROVAL_REQUIRED: "AWAITING_APPROVAL" } },
    AWAITING_APPROVAL: { on: { RENDER: "RENDERING", FAILED: "FAILED" } },
    RENDERING: { on: { EVALUATE: "EVALUATING", FAILED: "FAILED" } },
    EVALUATING: {
      on: { PASS: "APPROVED", REVIEW: "HUMAN_DECISION_REQUIRED", REJECT: "REPAIRING" },
    },
    HUMAN_DECISION_REQUIRED: {
      on: { APPROVE: "APPROVED", REPAIR: "REPAIRING", CANCEL: "CANCELLED" },
    },
    REPAIRING: { on: { EVALUATE: "EVALUATING", FAILED: "FAILED" } },
    APPROVED: { on: { EXPORT: "EXPORTED" } },
    EXPORTED: { on: { PUBLISH: "PUBLISHED" } },
    PUBLISHED: {},
    CANCELLED: {},
    FAILED: { on: { RETRY: "ANALYZING" } },
  },
});

export function canEditorTransition(current: EditorState, event: string) {
  const actor = createActor(editorMachine, {
    snapshot: editorMachine.resolveState({ value: current, context: {} }),
  });
  actor.start();
  const before = actor.getSnapshot().value;
  actor.send({ type: event });
  const after = actor.getSnapshot().value;
  actor.stop();
  return { allowed: before !== after, state: String(after) as EditorState };
}

export const editorProjectInput = z.object({
  name: z.string().trim().min(1).max(160),
  objective: z.string().trim().min(1).max(500),
  audience: z.string().trim().min(1).max(240),
  platform: z.string().trim().min(1).max(80),
  constraints: z.record(z.string(), z.unknown()).optional(),
  references: z.array(z.unknown()).optional(),
  memorySnapshot: z.record(z.string(), z.unknown()).optional(),
  idempotencyKey: z.string().trim().min(8).max(200),
});

export const editorIssueCodes = [
  "HOOK_WEAK",
  "PACE_TOO_SLOW",
  "PACE_TOO_FAST",
  "BROLL_SEMANTIC_MISMATCH",
  "FACE_OCCLUDED",
  "CAPTION_COLLISION",
  "CAPTION_OUT_OF_SAFE_ZONE",
  "REPETITIVE_VISUAL",
  "PRODUCT_FACT_RISK",
  "MOTION_TOO_AGGRESSIVE",
  "MOTION_TOO_WEAK",
  "AUDIO_DUCKING_ERROR",
  "AUDIO_CLIPPING",
  "TRANSCRIPT_MISMATCH",
  "OCR_ERROR",
  "LOGO_ERROR",
  "BRAND_STYLE_MISMATCH",
  "RIGHTS_ERROR",
  "PLATFORM_SPEC_ERROR",
] as const;

export const editorIssueSchema = z.object({
  issueCode: z.enum(editorIssueCodes),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  beatId: z.string().optional(),
  sourceEvidenceIds: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  explanation: z.string().min(1),
  proposedFix: z.string().min(1),
});
