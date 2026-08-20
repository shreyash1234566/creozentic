import { createHmac, createHash } from "node:crypto";

export type Evidence = {
  id: string;
  startSec?: number;
  endSec?: number;
  transcript?: string;
  verified?: boolean;
};
export type Beat = {
  id?: string;
  sequence: number;
  startSec: number;
  endSec: number;
  label: string;
  evidenceIds: string[];
  spokenText?: string;
};
export type EditDecision = {
  id: string;
  kind: "CUT" | "KEEP" | "TRANSITION" | "CAPTION" | "AUDIO";
  startSec: number;
  endSec: number;
  evidenceIds: string[];
  rationale: string;
};

export function buildEditDecisionList(beats: Beat[], evidence: Evidence[]): EditDecision[] {
  const evidenceIds = new Set(evidence.map((item) => item.id));
  return beats.flatMap((beat, index) => {
    const linked = beat.evidenceIds.filter((id) => evidenceIds.has(id));
    const decisions: EditDecision[] = [
      {
        id: `cut-${beat.sequence}`,
        kind: "KEEP",
        startSec: beat.startSec,
        endSec: beat.endSec,
        evidenceIds: linked,
        rationale: `Preserve ${beat.label} beat with linked evidence.`,
      },
    ];
    if (index > 0)
      decisions.push({
        id: `transition-${beat.sequence}`,
        kind: "TRANSITION",
        startSec: beat.startSec,
        endSec: beat.startSec + 0.15,
        evidenceIds: linked,
        rationale: "Bounded transition between approved beats.",
      });
    if (beat.spokenText)
      decisions.push({
        id: `caption-${beat.sequence}`,
        kind: "CAPTION",
        startSec: beat.startSec,
        endSec: beat.endSec,
        evidenceIds: linked,
        rationale: "Caption follows the approved spoken beat.",
      });
    return decisions;
  });
}

export function removeDeadAir(
  decisions: EditDecision[],
  silenceWindows: Array<{ startSec: number; endSec: number; silent: boolean }>,
) {
  const silent = silenceWindows.filter((window) => window.silent);
  return decisions
    .map((decision) => {
      const overlap = silent.find(
        (window) => window.startSec <= decision.startSec && window.endSec >= decision.startSec,
      );
      return overlap && decision.kind === "KEEP" && decision.endSec - decision.startSec > 0.5
        ? {
            ...decision,
            startSec: Math.min(decision.endSec, overlap.endSec),
            rationale: `${decision.rationale} Leading silence removed deterministically.`,
          }
        : decision;
    })
    .filter((decision) => decision.endSec > decision.startSec);
}

export function buildOtioTimeline(
  decisions: EditDecision[],
  fps = 30,
  visualInserts: Array<Record<string, unknown>> = [],
) {
  const visualClips = visualInserts.flatMap((insert, index) => {
    if (insert.approvalState !== "APPROVED" || typeof insert.assetSource !== "string") return [];
    const recipe =
      insert.motionRecipe && typeof insert.motionRecipe === "object"
        ? (insert.motionRecipe as Record<string, unknown>)
        : {};
    const startSec = Number(recipe.startSec ?? 0);
    const endSec = Number(recipe.endSec ?? startSec + 3);
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) return [];
    return [{
      id: String(insert.id ?? `visual-${index + 1}`),
      assetId: insert.assetSource,
      sourceRange: { start: 0, duration: Math.round((endSec - startSec) * fps) },
      timelineStart: Math.round(startSec * fps),
      metadata: {
        mediaType: recipe.mediaType === "GENERATED_VIDEO" ? "GENERATED_VIDEO" : "STILL_IMAGE",
        motionRecipe: recipe,
        factuality: insert.factuality ?? "UNVERIFIED",
      },
    }];
  });
  const imageClips = visualClips.filter((clip) => clip.metadata.mediaType === "STILL_IMAGE");
  const videoClips = visualClips.filter((clip) => clip.metadata.mediaType === "GENERATED_VIDEO");
  return {
    schema: "otio-v1",
    rate: fps,
    tracks: [
      {
        name: "main",
        kind: "Video",
        clips: decisions
          .filter((item) => item.kind === "KEEP")
          .map((item) => ({
            id: item.id,
            sourceRange: {
              start: Math.round(item.startSec * fps),
              duration: Math.round((item.endSec - item.startSec) * fps),
            },
            metadata: { evidenceIds: item.evidenceIds },
          })),
      },
      { name: "generated-stills", kind: "Image", clips: imageClips },
      { name: "generated-video-broll", kind: "Video", clips: videoClips },
    ],
  };
}

export function createRenderManifest(input: {
  planVersion: number;
  renderer: string;
  sourceChecksums: string[];
  promptVersions: Record<string, string>;
  outputFormats: string[];
  openSourceEditingPlan?: Record<string, string>;
}) {
  const manifest = {
    schema: "creozentic-render-manifest-v1",
    ...input,
    createdAt: new Date().toISOString(),
  };
  return {
    ...manifest,
    manifestHash: createHash("sha256").update(JSON.stringify(manifest)).digest("hex"),
  };
}

export function applyScopedRepair(
  decisions: EditDecision[],
  scope: string[],
  preserve: string[],
  replacement: EditDecision[],
) {
  const scopeSet = new Set(scope);
  const preserveSet = new Set(preserve);
  return decisions.map((decision) =>
    preserveSet.has(decision.id) || !scopeSet.has(decision.id)
      ? decision
      : (replacement.find((item) => item.id === decision.id) ?? decision),
  );
}

export function evaluateEditorSignals(input: {
  transcriptMatch: number;
  captionSafe: boolean;
  audioClipping: boolean;
  rightsVerified: boolean;
  visualMotionScore: number;
}) {
  const issues: string[] = [];
  if (input.transcriptMatch < 0.9) issues.push("TRANSCRIPT_MISMATCH");
  if (!input.captionSafe) issues.push("CAPTION_OUT_OF_SAFE_ZONE");
  if (input.audioClipping) issues.push("AUDIO_CLIPPING");
  if (!input.rightsVerified) issues.push("RIGHTS_UNVERIFIED");
  if (input.visualMotionScore > 0.9) issues.push("MOTION_TOO_AGGRESSIVE");
  return { verdict: issues.length ? "REVIEW" : "PASS", issues } as const;
}

export function selectRepurposeCandidates(
  items: Array<{ id: string; transcript: string; durationSec: number; evidenceScore: number }>,
  objective: string,
) {
  const terms = objective.toLowerCase().split(/\s+/).filter(Boolean);
  return items
    .map((item) => ({
      ...item,
      score: Math.min(
        1,
        item.evidenceScore * 0.6 +
          (terms.filter((term) => item.transcript.toLowerCase().includes(term)).length /
            Math.max(1, terms.length)) *
            0.4,
      ),
    }))
    .sort((a, b) => b.score - a.score);
}

export function normalizeAnalytics(
  events: Array<{ externalId: string; type: string; value: number; occurredAt: string }>,
) {
  const seen = new Set<string>();
  return events
    .filter((event) => {
      if (seen.has(event.externalId)) return false;
      seen.add(event.externalId);
      return true;
    })
    .map((event) => ({ ...event, occurredAt: new Date(event.occurredAt).toISOString() }));
}

export function assignExperiment(workspaceId: string, experimentKey: string, variants: string[]) {
  if (!variants.length) throw new Error("experiment needs variants");
  const hash = createHash("sha256")
    .update(`${workspaceId}:${experimentKey}`)
    .digest()
    .readUInt32BE(0);
  return {
    variant: variants[hash % variants.length],
    exposureKey: `${workspaceId}:${experimentKey}`,
  };
}

export function signWebhook(payload: string, secret: string) {
  return `v1=${createHmac("sha256", secret).update(payload).digest("hex")}`;
}

export function paginate<T>(items: T[], limit = 50, cursor = 0) {
  const safeLimit = Math.max(1, Math.min(200, limit));
  const page = items.slice(cursor, cursor + safeLimit);
  return {
    items: page,
    nextCursor: cursor + page.length < items.length ? String(cursor + page.length) : null,
  };
}

export function retentionCandidates(
  items: Array<{ id: string; expiresAt?: string | null; deletedAt?: string | null }>,
  now = new Date(),
) {
  return items
    .filter((item) => !item.deletedAt && item.expiresAt && new Date(item.expiresAt) <= now)
    .map((item) => item.id);
}

export function estimateRenderCost(durationSec: number, outputs: number, ratePerMinute = 1) {
  return Math.max(0, Math.ceil((durationSec / 60) * outputs * ratePerMinute));
}

export function providerHealth(
  provider: string,
  healthy: boolean,
  latencyMs?: number,
  errorCode?: string,
) {
  return { provider, healthy, latencyMs, errorCode, checkedAt: new Date().toISOString() };
}
