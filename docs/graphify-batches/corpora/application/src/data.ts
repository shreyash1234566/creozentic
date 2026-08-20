/* Shared static data for Chitra Studio */

export type ModelInfo = {
  id: string;
  name: string;
  provider: string;
  kind: "image" | "edit" | "video" | "text" | "audio";
  costUsd: number; // per call, illustrative
  avgSec: number;
  quality: number; // 1-5
};

export const MODELS: ModelInfo[] = [
  {
    id: "sdxl",
    name: "SDXL Turbo",
    provider: "Replicate",
    kind: "image",
    costUsd: 0.012,
    avgSec: 4,
    quality: 3,
  },
  {
    id: "imagen",
    name: "Imagen 3",
    provider: "Google",
    kind: "image",
    costUsd: 0.04,
    avgSec: 9,
    quality: 5,
  },
  {
    id: "flux",
    name: "FLUX.1 pro",
    provider: "fal.ai",
    kind: "image",
    costUsd: 0.055,
    avgSec: 7,
    quality: 5,
  },
  {
    id: "gptimg",
    name: "gpt-image-1",
    provider: "OpenAI",
    kind: "image",
    costUsd: 0.07,
    avgSec: 12,
    quality: 4,
  },
  {
    id: "edit",
    name: "FLUX Fill",
    provider: "fal.ai",
    kind: "edit",
    costUsd: 0.03,
    avgSec: 6,
    quality: 4,
  },
  {
    id: "kling",
    name: "Kling 1.5",
    provider: "Replicate",
    kind: "video",
    costUsd: 0.9,
    avgSec: 95,
    quality: 4,
  },
  {
    id: "gpt",
    name: "gpt-4o-mini",
    provider: "OpenAI",
    kind: "text",
    costUsd: 0.0006,
    avgSec: 2,
    quality: 4,
  },
  {
    id: "eleven",
    name: "ElevenLabs v3",
    provider: "ElevenLabs",
    kind: "audio",
    costUsd: 0.05,
    avgSec: 8,
    quality: 5,
  },
];

export const USD_INR = 88;

// Sample furniture/jewellery imagery used across generation surfaces
export const SAMPLE_IMAGES = [
  "photo-1616693153250-bb03055788eb",
  "photo-1742466526007-84a6d0455210",
  "photo-1624351231514-aa7a3189d9cf",
  "photo-1647221598498-245f6ed6c720",
  "photo-1560448204-e02f11c3d0e2",
  "photo-1628744876497-eb30460be9f6",
  "photo-1543294001-f7cd5d7fb516",
  "photo-1605100804763-247f67b3557e",
];

export const img = (id: string, w = 400, h = 500) =>
  `https://images.unsplash.com/${id}?w=${w}&h=${h}&fit=crop&auto=format`;

export const STYLES = [
  "Scandi loft",
  "Warm evening",
  "Minimal white",
  "Blue studio",
  "Marble luxe",
  "Terracotta",
];

/* ── Feature checklist (from the brief, verbatim intent) ── */

export type ChecklistItem = { id: string; feature: string; what: string; phase: string };
export type ChecklistGroup = { key: string; title: string; note: string; items: ChecklistItem[] };

/* ── Revised, customer-outcome-first feature status (blueprint §4) ── */

export type Priority = "P0" | "P1" | "P2" | "P3" | "Defer";
export type RevisedFeature = {
  id: string;
  feature: string;
  origPhase: string;
  priority: Priority;
  rule: string;
  route?: string; // live module in this build
};

export const PRIORITY_META: Record<Priority, { label: string; color: string }> = {
  P0: { label: "P0 · paid MVP", color: "text-saffron-deep" },
  P1: { label: "P1 · after first workflow", color: "text-indigo" },
  P2: { label: "P2 · scale / distribution", color: "text-leaf" },
  P3: { label: "P3 · enterprise / moat", color: "text-ink-soft" },
  Defer: { label: "Defer", color: "text-ink-soft" },
};

export const REVISED_FEATURES: RevisedFeature[] = [
  {
    id: "model-router",
    feature: "Model router",
    origPhase: "1",
    priority: "P0",
    rule: "Capability routing, estimates, retries, fallback",
    route: "models",
  },
  {
    id: "brand-memory",
    feature: "Brand memory",
    origPhase: "1–2",
    priority: "P0",
    rule: "Structured, versioned, explainable rules",
    route: "brand",
  },
  {
    id: "workflow-engine",
    feature: "Workflow / agent engine",
    origPhase: "1",
    priority: "P0",
    rule: "Fixed templates first; every run versioned",
    route: "workflow",
  },
  {
    id: "canvas-chat",
    feature: "Canvas / chat UI",
    origPhase: "1",
    priority: "P0",
    rule: "Brief-to-pack workspace first; chat is an input mode",
    route: "productlock",
  },
  {
    id: "guided-input",
    feature: "Guided input / brief forms",
    origPhase: "2",
    priority: "P0",
    rule: "No prompt expertise required",
    route: "productlock",
  },
  {
    id: "review-node",
    feature: "Human-review checkpoint",
    origPhase: "2–3",
    priority: "P0",
    rule: "Required before publishing / autonomy",
    route: "review",
  },
  {
    id: "composer",
    feature: "Composer / layout tool",
    origPhase: "2",
    priority: "P0",
    rule: "Fixed templates before freeform layout",
    route: "composer",
  },
  {
    id: "batch",
    feature: "Batch catalogue / sheet generation",
    origPhase: "2",
    priority: "P0",
    rule: "Required for furniture/jewellery economics",
    route: "batch",
  },
  {
    id: "multi-format",
    feature: "Multi-format export",
    origPhase: "2",
    priority: "P0",
    rule: "Deterministic rendering from one approved concept",
    route: "batch",
  },
  {
    id: "credits-billing",
    feature: "Credits, billing & teams",
    origPhase: "2",
    priority: "P1",
    rule: "Immutable ledger with reservation / settlement",
    route: "billing",
  },
  {
    id: "model-compare",
    feature: "In-workflow model comparison",
    origPhase: "2",
    priority: "P1",
    rule: "Quality/speed/cost choice with explicit billing",
    route: "models",
  },
  {
    id: "node-canvas",
    feature: "Node-based workflow canvas",
    origPhase: "2",
    priority: "P1",
    rule: "Only after three fixed workflows have repeat usage",
    route: "workflow",
  },
  {
    id: "localization",
    feature: "One-click localization",
    origPhase: "3",
    priority: "P1",
    rule: "Locale, glossary, layout and legal checks",
    route: "localization",
  },
  {
    id: "consistency",
    feature: "Character / product consistency",
    origPhase: "3",
    priority: "P1",
    rule: "Product-lock path has priority",
    route: "consistency",
  },
  {
    id: "logic-nodes",
    feature: "Logic / data nodes",
    origPhase: "3–4",
    priority: "P1",
    rule: "Typed branching after real needs appear",
    route: "workflow",
  },
  {
    id: "upscale",
    feature: "Upscaling / video merge",
    origPhase: "4–5",
    priority: "P1",
    rule: "Static delivery quality precedes cinematic editing",
    route: "video",
  },
  {
    id: "whatsapp-agent",
    feature: "Chat / WhatsApp-triggered agents",
    origPhase: "3",
    priority: "P2",
    rule: "Approval and message-window aware",
    route: "connectors",
  },
  {
    id: "deploy-app",
    feature: "Deploy-as-app",
    origPhase: "3–4",
    priority: "P2",
    rule: "Version-pinned, scoped workflows only",
  },
  {
    id: "gdrive",
    feature: "Google Drive input / output",
    origPhase: "3",
    priority: "P2",
    rule: "OAuth, folder mapping, idempotent sync",
    route: "connectors",
  },
  {
    id: "perf-gen",
    feature: "Performance-informed generation",
    origPhase: "4",
    priority: "P2",
    rule: "Capture outcome data from the beginning",
  },
  {
    id: "ad-nodes",
    feature: "Ad / social nodes",
    origPhase: "4–5",
    priority: "P2",
    rule: "Export first; publish with permissions / receipts",
    route: "connectors",
  },
  {
    id: "scheduled",
    feature: "Scheduled / API-triggered batches",
    origPhase: "5",
    priority: "P2",
    rule: "Idempotency, quotas, approval, failure alerts",
  },
  {
    id: "lipsync",
    feature: "Lip-sync / native audio-in-video",
    origPhase: "4",
    priority: "P3",
    rule: "Only after video demand and margin are proven",
    route: "video",
  },
  {
    id: "competitor",
    feature: "Competitor monitoring agent",
    origPhase: "5",
    priority: "P3",
    rule: "Permitted sources only; no unlawful scraping",
  },
  {
    id: "marketplace",
    feature: "Agent / template marketplace",
    origPhase: "5",
    priority: "P3",
    rule: "Requires library, moderation and support",
  },
  {
    id: "custom-model",
    feature: "Custom brand-tuned model",
    origPhase: "5+",
    priority: "P3",
    rule: "Funded benchmark and rollback required",
  },
];

export const FOUNDATIONS: { feature: string; why: string; route?: string }[] = [
  {
    feature: "Asset library & versioning",
    why: "Source of truth for products, logos, references, outputs and old versions",
    route: "assets",
  },
  {
    feature: "Product catalogue / schema",
    why: "Batch generation cannot safely use filenames alone",
    route: "assets",
  },
  {
    feature: "Job queue & execution state",
    why: "Provider jobs are asynchronous and fail partially",
    route: "workflow",
  },
  {
    feature: "Quality / product-integrity gate",
    why: "Beautiful but wrong assets create returns and brand damage",
    route: "productlock",
  },
  {
    feature: "Review inbox & comments",
    why: "Approval is a workflow, not a hidden boolean",
    route: "review",
  },
  {
    feature: "Export packager",
    why: "Customers need correctly named, metadata-rich deliverables",
    route: "batch",
  },
  {
    feature: "Usage / cost observability",
    why: "Retries and provider cost can silently destroy margin",
    route: "billing",
  },
  {
    feature: "Permissions & audit log",
    why: "Agencies need client separation and proof of approval",
    route: "review",
  },
  { feature: "Integration health", why: "OAuth tokens expire and scopes change" },
  {
    feature: "Privacy / IP / consent controls",
    why: "Faces, voices, logos, client work and assets need clear rules",
  },
  {
    feature: "Evaluation harness",
    why: "Provider/model changes must be detected before customers find them",
  },
  { feature: "Notifications", why: "Long-running jobs need status updates, not a spinner" },
];

export const CHECKLIST: ChecklistGroup[] = [
  {
    key: "A",
    title: "Core Platform",
    note: "Yeh 5 cheezein poore product ki foundation hain — baaki sab isi ke upar banega.",
    items: [
      {
        id: "model-router",
        feature: "Model router",
        what: "Kai AI providers (OpenAI, Google, Replicate/fal.ai, ElevenLabs) ko ek hi internal interface ke peeche unify karta hai",
        phase: "Phase 1",
      },
      {
        id: "brand-memory",
        feature: "Brand memory",
        what: "Har brand ka persistent profile — colors, tone, logo, reference images",
        phase: "Phase 1–2",
      },
      {
        id: "workflow-engine",
        feature: "Workflow / agent engine",
        what: "Reusable, repeatable generation pipelines (fixed templates se shuru)",
        phase: "Phase 1",
      },
      {
        id: "canvas-chat",
        feature: "Canvas / chat UI",
        what: "Jahan se user generation direct karta hai aur output approve karta hai",
        phase: "Phase 1",
      },
      {
        id: "credits-billing",
        feature: "Credits, billing & teams",
        what: "Usage metering, plans, seats — Stripe/Razorpay",
        phase: "Phase 2",
      },
    ],
  },
  {
    key: "B",
    title: "High Priority",
    note: "Yeh directly Autozentic ke real clients (furniture/jewellery catalogs) ke kaam aayenge.",
    items: [
      {
        id: "node-canvas",
        feature: "Node-based workflow canvas",
        what: "Drag-and-drop builder — bina code ke workflow customize kar sakte ho",
        phase: "Phase 2",
      },
      {
        id: "composer",
        feature: "Composer / in-app layout tool",
        what: "Generated image + logo + headline + CTA ek finished ad mein combine karo",
        phase: "Phase 2",
      },
      {
        id: "batch",
        feature: "Batch generation (catalog/sheet)",
        what: "Ek workflow ko poore product list ya CSV upload par ek saath chalao",
        phase: "Phase 2",
      },
      {
        id: "review-node",
        feature: "Human-review checkpoint node",
        what: "Workflow beech mein pause hoke insaan se approval/refinement maangta hai",
        phase: "Phase 2–3",
      },
      {
        id: "multi-format",
        feature: "Multi-format / aspect-ratio export",
        what: "Ek asset se Instagram feed, Story, aur landscape — sab formats ek saath",
        phase: "Phase 2",
      },
      {
        id: "model-compare",
        feature: "In-workflow model comparison",
        what: "Ek hi prompt ko 2–3 models par test karke best/cheapest choose karo",
        phase: "Phase 2",
      },
      {
        id: "guided-input",
        feature: "Guided input / brief forms",
        what: "Blank prompt box ki jagah structured form",
        phase: "Phase 2",
      },
    ],
  },
  {
    key: "C",
    title: "Medium Priority",
    note: "Yeh existing roadmap (localization, WhatsApp, video) ko extend karte hain.",
    items: [
      {
        id: "localization",
        feature: "One-click localization",
        what: "Ek hi asset se multiple languages/markets ke liye creative generate karo",
        phase: "Phase 3",
      },
      {
        id: "consistency",
        feature: "Character & product consistency",
        what: "Ek hi model/mascot/product ko poore campaign mein consistent rakho",
        phase: "Phase 3",
      },
      {
        id: "whatsapp-agent",
        feature: "Chat / WhatsApp-triggered agents",
        what: "Dashboard ki jagah ek WhatsApp message se workflow trigger karo",
        phase: "Phase 3",
      },
      {
        id: "deploy-app",
        feature: "Deploy-as-app",
        what: "Ek working workflow ko simple self-serve tool banao",
        phase: "Phase 3–4",
      },
      {
        id: "logic-nodes",
        feature: "Logic & data nodes",
        what: "Rules ke basis par workflow branch karo, list split karo, prompts merge karo",
        phase: "Phase 3–4",
      },
      {
        id: "gdrive",
        feature: "Google Drive input/output node",
        what: "Client ke Drive folder se assets uthao aur seedha wahi deliver karo",
        phase: "Phase 3",
      },
      {
        id: "lipsync",
        feature: "Lip-sync + native audio-in-video",
        what: "Avatar ke mouth movement ko voiceover se sync karo",
        phase: "Phase 4",
      },
    ],
  },
  {
    key: "D",
    title: "Future / Enterprise",
    note: "Yeh bade user base ya bade client budget maangte hain — sabse last mein.",
    items: [
      {
        id: "perf-gen",
        feature: "Performance-informed generation",
        what: "Ad performance data (CTR, conversions) ko brand memory mein feed karo",
        phase: "Phase 4",
      },
      {
        id: "ad-nodes",
        feature: "Ad & Social nodes in workflow",
        what: "Workflow ke andar se hi Meta/TikTok se data pull ya publish karo",
        phase: "Phase 4–5",
      },
      {
        id: "competitor",
        feature: "Competitor monitoring agent",
        what: "Competitor ads / TikTok activity automatically pull karke summarize karo",
        phase: "Phase 5",
      },
      {
        id: "marketplace",
        feature: "Agent / template marketplace",
        what: "Users apne workflow templates dusre brands ke saath share karein",
        phase: "Phase 5",
      },
      {
        id: "upscale",
        feature: "Upscaling & video-merge tools",
        what: "Final asset ko upscale karo, multiple clips ko ek sequence mein jodo",
        phase: "Phase 4–5",
      },
      {
        id: "scheduled",
        feature: "Scheduled / API-triggered batch runs",
        what: "Agent ko schedule ya external trigger par automatically chalao",
        phase: "Phase 5",
      },
      {
        id: "custom-model",
        feature: "Custom brand-tuned model",
        what: "Bade brand ke liye dedicated fine-tuned model",
        phase: "Phase 5+",
      },
    ],
  },
];
