export type QualityMode = "fast" | "balanced" | "quality";

export type CreativeCapability =
  | "image.generate"
  | "image.edit"
  | "image.reference"
  | "text.generate"
  | "video.generate"
  | "video.edit"
  | "audio.generate"
  | "audio.lipsync"
  | "moderation"
  | "upscale"
  | "render";

export type RunState =
  | "draft"
  | "quoted"
  | "reserved"
  | "queued"
  | "running"
  | "awaiting_review"
  | "approved"
  | "succeeded"
  | "exported"
  | "published"
  | "retryable_failure"
  | "terminal_failure"
  | "cancelled";

export type Verdict = "pass" | "warn" | "critical";

export type QualityCheck = {
  dimension: string;
  verdict: Verdict;
  repair?: string;
};

export type CreativeRoute = {
  id: string;
  label: string;
  capability: CreativeCapability;
  provider: string;
  model: string;
  modelVersion: string;
  qualityMode: QualityMode;
  supportsProductLock: boolean;
  supportedRatios: string[];
  unitsPerOutput: number;
  avgSec: number;
  reliability: number;
};

export type CreativeQuote = {
  routeId: string;
  qualityMode: QualityMode;
  credits: number;
  providerCostMinor: number;
  currency: "INR";
  etaSec: number;
  outputCount: number;
  outputFormats: string[];
  label: string;
};

export type ProductLockBrief = {
  product: string;
  sku: string;
  scene: string;
  count: number;
  mode: "lock" | "creative";
  qualityMode: QualityMode;
  outputFormats: string[];
  audience: string;
  language: string;
  cta: string;
  headline?: string;
  body?: string;
  hashtags?: string[];
  altText?: string;
  campaignId?: string;
  directionId?: string;
};

export type OutputAsset = {
  id: string;
  runId: string;
  name: string;
  imgId: string;
  format: string;
  ratio: string;
  width: number;
  height: number;
  locale: string;
  status: "draft" | "approved" | "rejected" | "exported";
  aiEdited: boolean;
  assetId?: string;
  downloadUrl?: string;
  qualityScores?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type ReviewComment = {
  id: string;
  author: string;
  text: string;
  region: string;
  assetId?: string;
  anchor?: { x?: number; y?: number; t?: number };
  createdAt: number;
};

export type ReviewTask = {
  id: string;
  runId: string;
  workspaceId: string;
  title: string;
  brand: string;
  version: string;
  kind: "static" | "video";
  images: string[];
  outputs: OutputAsset[];
  status: "pending" | "approved" | "rejected" | "refinement_requested";
  verdicts: Record<string, QualityCheck>;
  comments: ReviewComment[];
  requiredRoles: string[];
  createdAt: number;
};

export type WorkflowRun = {
  id: string;
  workspaceId: string;
  templateId: string;
  templateVersion: string;
  state: RunState;
  title: string;
  brief: ProductLockBrief;
  brandVersion: number;
  quote: CreativeQuote;
  reservationId?: string;
  outputs: OutputAsset[];
  reviewTaskId?: string;
  progress: { currentNode: string; completed: number; total: number };
  warnings: string[];
  error?: string;
  createdAt: number;
  updatedAt: number;
  serverId?: string;
};

export type Reservation = {
  id: string;
  workspaceId: string;
  runId: string;
  amount: number;
  status: "reserved" | "settled" | "released" | "refunded";
  createdAt: number;
  settledAt?: number;
};

export const ROUTES: CreativeRoute[] = [
  {
    id: "image-fast",
    label: "Fast",
    capability: "image.generate",
    provider: "Replicate",
    model: "SDXL Turbo",
    modelVersion: "sdxl-turbo-2026.01",
    qualityMode: "fast",
    supportsProductLock: false,
    supportedRatios: ["1:1", "4:5", "9:16", "16:9"],
    unitsPerOutput: 1,
    avgSec: 18,
    reliability: 0.97,
  },
  {
    id: "image-balanced",
    label: "Balanced",
    capability: "image.generate",
    provider: "fal.ai",
    model: "FLUX.1 pro",
    modelVersion: "flux-1-pro-2026.02",
    qualityMode: "balanced",
    supportsProductLock: true,
    supportedRatios: ["1:1", "4:5", "9:16", "16:9"],
    unitsPerOutput: 1,
    avgSec: 28,
    reliability: 0.95,
  },
  {
    id: "image-quality",
    label: "Quality",
    capability: "image.generate",
    provider: "Google",
    model: "Imagen",
    modelVersion: "imagen-latest-compatible",
    qualityMode: "quality",
    supportsProductLock: true,
    supportedRatios: ["1:1", "4:5", "9:16", "16:9"],
    unitsPerOutput: 2,
    avgSec: 42,
    reliability: 0.94,
  },
];

export const FORMAT_REGISTRY = [
  { id: "feed", label: "Feed", ratio: "1:1", width: 1080, height: 1080 },
  {
    id: "portrait",
    label: "Portrait",
    ratio: "4:5",
    width: 1080,
    height: 1350,
  },
  { id: "story", label: "Story", ratio: "9:16", width: 1080, height: 1920 },
  {
    id: "landscape",
    label: "Landscape",
    ratio: "16:9",
    width: 1920,
    height: 1080,
  },
] as const;

export function uid(prefix: string) {
  const randomId = globalThis.crypto?.randomUUID?.();
  return `${prefix}_${randomId ?? Math.random().toString(36).slice(2, 11)}`;
}

export function routeCreativeRequest({
  qualityMode,
  productLock,
  outputFormats,
}: {
  qualityMode: QualityMode;
  productLock: boolean;
  outputFormats: string[];
}) {
  const route = ROUTES.find((candidate) => candidate.qualityMode === qualityMode) ?? ROUTES[1];
  const unsupported = outputFormats.filter((format) => !route.supportedRatios.includes(format));
  if (productLock && !route.supportsProductLock) {
    return {
      route: ROUTES[1],
      warnings: ["Fast mode cannot guarantee product-lock integrity; Balanced mode selected."],
    };
  }
  if (unsupported.length > 0) {
    return {
      route,
      warnings: [
        `The selected route does not support ${unsupported.join(", ")}; those formats will be skipped.`,
      ],
    };
  }
  return { route, warnings: [] as string[] };
}

export function quoteProductLock({
  count,
  qualityMode,
  productLock,
  outputFormats,
}: {
  count: number;
  qualityMode: QualityMode;
  productLock: boolean;
  outputFormats: string[];
}): CreativeQuote & { route: CreativeRoute; warnings: string[] } {
  const selection = routeCreativeRequest({
    qualityMode,
    productLock,
    outputFormats,
  });
  const countSafe = Math.max(1, Math.min(12, count));
  const formatCount = Math.max(1, outputFormats.length);
  // A requested ratio is a separate rendered/provider output. Quotes and
  // reservations must therefore use the same cardinality as provider cost.
  const credits = countSafe * formatCount * selection.route.unitsPerOutput;
  return {
    routeId: selection.route.id,
    qualityMode: selection.route.qualityMode,
    credits,
    providerCostMinor: Math.round(countSafe * formatCount * selection.route.unitsPerOutput * 5.5),
    currency: "INR",
    etaSec: selection.route.avgSec * countSafe,
    outputCount: countSafe * formatCount,
    outputFormats,
    label: `${selection.route.label} route · ${countSafe} controlled variant${
      countSafe === 1 ? "" : "s"
    }`,
    route: selection.route,
    warnings: selection.warnings,
  };
}

const TRANSITIONS: Record<RunState, RunState[]> = {
  draft: ["quoted", "cancelled"],
  quoted: ["reserved", "cancelled"],
  reserved: ["queued", "cancelled", "retryable_failure"],
  queued: ["running", "cancelled", "retryable_failure"],
  running: ["awaiting_review", "succeeded", "retryable_failure", "terminal_failure", "cancelled"],
  awaiting_review: ["running", "approved", "retryable_failure", "terminal_failure"],
  approved: ["succeeded", "exported"],
  succeeded: ["exported"],
  exported: ["published"],
  published: [],
  retryable_failure: ["queued", "cancelled", "terminal_failure"],
  terminal_failure: [],
  cancelled: [],
};

export function canTransition(from: RunState, to: RunState) {
  return TRANSITIONS[from].includes(to);
}
