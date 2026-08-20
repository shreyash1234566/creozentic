import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  canTransition,
  type CreativeQuote,
  type OutputAsset,
  type ProductLockBrief,
  type QualityCheck,
  type Reservation,
  type ReviewComment,
  type ReviewTask,
  type RunState,
  type WorkflowRun,
  uid,
} from "./domain";
import { getServerState, startServerRun } from "./client/api";

export type Brand = {
  id?: string;
  approvalStatus?: string;
  name: string;
  tagline: string;
  tone: string;
  colors: string[];
  fonts: string;
  references: string[];
  referenceAssetIds?: string[];
  vertical: string;
  language: string;
  category: string;
  audience: string;
  locations: string[];
  preferredLanguages: string[];
  allowedColors: string[];
  forbiddenColors: string[];
  preferredWords: string[];
  prohibitedWords: string[];
  claimSensitiveTerms: string[];
  logoPlacement: string;
  safeArea: string;
  productTruthRules: string;
  disclosureRequired: boolean;
  version: number;
  dailyPolicy?: {
    postsPerWeek: number;
    defaultMode: "DRAFT" | "APPROVAL" | "GUARDED_AUTOPUBLISH" | "CAMPAIGN";
    allowedAutopublishTypes: string[];
    blockedTypes: string[];
    approvalSlaHours: number;
  };
  contentPillars?: string[];
  visualSystem?: {
    templateFamilies: string[];
    lockedLayers: string[];
    allowedImageModes: string[];
    defaultFormats?: string[];
  };
  claimsPolicy?: { requireEvidence: boolean; forbiddenTerms: string[] };
  approvedExamples?: string[];
  avoidExamples?: string[];
  website?: string;
  instagram?: string;
  sourceFolder?: string;
};

export type LedgerEntry = {
  id: string;
  ts: number;
  label: string;
  credits: number;
  kind: "image" | "edit" | "video" | "text" | "topup";
  state: "reserve" | "consume" | "release" | "refund" | "adjustment" | "topup";
  runId?: string;
  reservationId?: string;
};

export type Seat = {
  id: string;
  name: string;
  email: string;
  role: "Owner" | "Editor" | "Reviewer";
};
export type AuditEvent = {
  id: string;
  ts: number;
  actor: string;
  action: string;
  target: string;
};

type Store = {
  backendEnabled: boolean;
  role:
    | "OWNER"
    | "ADMIN"
    | "STRATEGIST"
    | "EDITOR"
    | "REVIEWER"
    | "CLIENT"
    | "PUBLISHER"
    | "BILLING"
    | "VIEWER";
  brand: Brand;
  setBrand: (b: Brand) => void;
  credits: number;
  ledger: LedgerEntry[];
  spend: (label: string, credits: number, kind: LedgerEntry["kind"]) => boolean;
  topup: (credits: number) => void;
  reservedCredits: number;
  reservations: Reservation[];
  workflowRuns: WorkflowRun[];
  reviewTasks: ReviewTask[];
  createWorkflowRun: (input: {
    title: string;
    brief: ProductLockBrief;
    brandVersion: number;
    quote: CreativeQuote;
    workspaceId?: string;
  }) => string | null;
  updateWorkflowRun: (id: string, patch: Partial<WorkflowRun>) => void;
  transitionWorkflowRun: (id: string, state: RunState, patch?: Partial<WorkflowRun>) => boolean;
  completeWorkflowRun: (
    id: string,
    outputs: OutputAsset[],
    verdicts: Record<string, QualityCheck>,
  ) => boolean;
  cancelWorkflowRun: (id: string) => boolean;
  decideReviewTask: (id: string, status: ReviewTask["status"]) => boolean;
  addReviewComment: (id: string, comment: Omit<ReviewComment, "id" | "createdAt">) => void;
  exportWorkflowRun: (id: string) => boolean;
  seats: Seat[];
  addSeat: (s: Omit<Seat, "id">) => void;
  removeSeat: (id: string) => void;
  done: Record<string, boolean>;
  toggleDone: (id: string) => void;
  audit: AuditEvent[];
  logAudit: (action: string, target: string, actor?: string) => void;
  refreshServerState: () => Promise<void>;
  startServerWorkflow: (input: {
    title: string;
    brief: ProductLockBrief;
    idempotencyKey: string;
    workflowVersionId?: string;
  }) => Promise<{ runId?: string; error?: string }>;
};

const DEFAULT_BRAND: Brand = {
  name: "Kosmic Furniture",
  tagline: "Modern living, made in Jaipur.",
  tone: "Warm, aspirational, uncluttered. Speaks to young Indian families setting up their first home.",
  colors: ["#1f2a44", "#c98a3a", "#f2ede3", "#7a8b6f"],
  fonts: "Fraunces / Inter",
  references: [
    "photo-1616693153250-bb03055788eb",
    "photo-1560448204-e02f11c3d0e2",
    "photo-1624351231514-aa7a3189d9cf",
  ],
  vertical: "Furniture",
  language: "Hinglish",
  category: "Furniture and home décor",
  audience: "Young Indian families setting up their first home",
  locations: ["Jaipur", "Delhi NCR", "Mumbai"],
  preferredLanguages: ["Hinglish", "Hindi", "English"],
  allowedColors: ["#1f2a44", "#c98a3a", "#f2ede3", "#7a8b6f"],
  forbiddenColors: ["neon pink", "fluorescent green"],
  preferredWords: ["crafted", "warm", "made for living"],
  prohibitedWords: ["best in India", "guaranteed", "cheap"],
  claimSensitiveTerms: ["solid wood", "lifetime", "discount", "guaranteed"],
  logoPlacement: "Top-left with 8% clear space",
  safeArea: "Keep headline and CTA 12% from platform edges",
  productTruthRules:
    "Product shape, count, material, packaging text, dimensions, and colour must never silently change.",
  disclosureRequired: true,
  version: 7,
  dailyPolicy: {
    postsPerWeek: 5,
    defaultMode: "APPROVAL",
    allowedAutopublishTypes: ["evergreen_education"],
    blockedTypes: ["testimonial", "price_offer", "regulated_claim"],
    approvalSlaHours: 12,
  },
  contentPillars: ["evergreen education", "product truth", "community proof"],
  visualSystem: {
    templateFamilies: ["daily-poster", "product-proof"],
    lockedLayers: ["logo", "product", "price", "disclosure"],
    allowedImageModes: ["real_asset", "product_lock_scene", "abstract_broll"],
    defaultFormats: ["1:1", "4:5", "9:16"],
  },
  claimsPolicy: { requireEvidence: true, forbiddenTerms: ["guaranteed"] },
};

const DEFAULT_SEATS: Seat[] = [
  {
    id: "s1",
    name: "Aarav Mehta",
    email: "aarav@autozentic.in",
    role: "Owner",
  },
  {
    id: "s2",
    name: "Priya Nair",
    email: "priya@autozentic.in",
    role: "Editor",
  },
  {
    id: "s3",
    name: "Kosmic Studio",
    email: "studio@kosmic.in",
    role: "Reviewer",
  },
];

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toLocalOutput(value: unknown, runId: string): OutputAsset {
  const raw = objectRecord(value);
  const metadata = objectRecord(raw.metadata);
  return {
    id: stringValue(raw.id, uid("output")),
    runId,
    name: stringValue(raw.name, "output.png"),
    imgId: stringValue(metadata.imgId),
    format: stringValue(raw.format, "Feed"),
    ratio: stringValue(metadata.ratio, stringValue(raw.format, "1:1")),
    width: numberValue(raw.width, 1080),
    height: numberValue(raw.height, 1080),
    locale: stringValue(raw.locale, "Hinglish"),
    status: stringValue(raw.status, "DRAFT").toLowerCase() as OutputAsset["status"],
    aiEdited: metadata.aiEdited !== false,
    assetId: stringValue(raw.assetId) || undefined,
    downloadUrl: stringValue(metadata.downloadUrl) || undefined,
    qualityScores:
      raw.qualityScores && typeof raw.qualityScores === "object"
        ? (raw.qualityScores as Record<string, unknown>)
        : undefined,
    metadata:
      raw.metadata && typeof raw.metadata === "object"
        ? (raw.metadata as Record<string, unknown>)
        : undefined,
  };
}

function toLocalWorkflowRun(value: unknown): WorkflowRun | null {
  const raw = objectRecord(value);
  const id = stringValue(raw.id);
  if (!id) return null;
  const brief = objectRecord(raw.briefSnapshot) as unknown as ProductLockBrief;
  const quoteRaw = objectRecord(raw.quoteSnapshot);
  const quote: CreativeQuote = {
    routeId: stringValue(quoteRaw.routeId, "image-balanced"),
    qualityMode: stringValue(quoteRaw.qualityMode, "balanced") as CreativeQuote["qualityMode"],
    credits: numberValue(quoteRaw.credits),
    providerCostMinor: numberValue(quoteRaw.providerCostMinor),
    currency: "INR",
    etaSec: numberValue(quoteRaw.etaSec),
    outputCount: numberValue(quoteRaw.outputCount),
    outputFormats: Array.isArray(quoteRaw.outputFormats)
      ? quoteRaw.outputFormats.filter((item): item is string => typeof item === "string")
      : [],
    label: stringValue(quoteRaw.label, "Server workflow route"),
  };
  const nodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  const completed = nodes.filter((node) => objectRecord(node).state === "SUCCEEDED").length;
  const outputs = Array.isArray(raw.outputs)
    ? raw.outputs.map((output) => toLocalOutput(output, id))
    : [];
  return {
    id,
    serverId: id,
    workspaceId: stringValue(raw.workspaceId, "workspace-autozentic-demo"),
    templateId: "product-photo-to-lifestyle",
    templateVersion: "v1.0.0",
    state: stringValue(raw.state, "QUEUED").toLowerCase() as RunState,
    title: stringValue(raw.title, "Server workflow run"),
    brief,
    brandVersion: numberValue(objectRecord(raw.brandSnapshot).version, 1),
    quote,
    outputs,
    reviewTaskId: objectRecord(raw.reviewTask).id
      ? stringValue(objectRecord(raw.reviewTask).id)
      : undefined,
    progress: {
      currentNode:
        completed === nodes.length && nodes.length > 0 ? "Human review checkpoint" : "Queued",
      completed,
      total: Math.max(nodes.length, 1),
    },
    warnings: Array.isArray(raw.warnings)
      ? raw.warnings.filter((warning): warning is string => typeof warning === "string")
      : [],
    error: objectRecord(raw.error).message
      ? stringValue(objectRecord(raw.error).message)
      : undefined,
    createdAt: new Date(stringValue(raw.createdAt)).getTime() || Date.now(),
    updatedAt: new Date(stringValue(raw.updatedAt)).getTime() || Date.now(),
  };
}

function toLocalReviewTask(value: unknown): ReviewTask | null {
  const raw = objectRecord(value);
  const id = stringValue(raw.id);
  const runId = stringValue(raw.runId);
  if (!id || !runId) return null;
  const outputs = Array.isArray(raw.outputs)
    ? raw.outputs.map((output) => toLocalOutput(output, runId))
    : [];
  const comments = Array.isArray(raw.comments)
    ? raw.comments.map((comment) => {
        const item = objectRecord(comment);
        return {
          id: stringValue(item.id, uid("comment")),
          author: stringValue(item.externalAuthor, stringValue(item.authorId, "Workspace member")),
          text: stringValue(item.text),
          region: stringValue(item.region, "asset"),
          assetId: stringValue(item.assetId) || undefined,
          anchor:
            item.anchor && typeof item.anchor === "object"
              ? (item.anchor as { x?: number; y?: number; t?: number })
              : undefined,
          createdAt: new Date(stringValue(item.createdAt)).getTime() || Date.now(),
        };
      })
    : [];
  return {
    id,
    runId,
    workspaceId: stringValue(raw.workspaceId, "workspace-autozentic-demo"),
    title: stringValue(raw.title, "Review task"),
    brand: "Workspace brand",
    version: `server run ${runId.slice(-8)}`,
    kind: stringValue(raw.kind, "static") as "static" | "video",
    images: outputs.map((output) => output.downloadUrl ?? output.imgId),
    outputs,
    status: stringValue(raw.status, "PENDING").toLowerCase() as ReviewTask["status"],
    verdicts: objectRecord(raw.verdicts) as Record<string, QualityCheck>,
    comments,
    requiredRoles: Array.isArray(raw.requiredRoles)
      ? raw.requiredRoles.filter((role): role is string => typeof role === "string")
      : ["EDITOR", "REVIEWER"],
    createdAt: new Date(stringValue(raw.createdAt)).getTime() || Date.now(),
  };
}

function toLocalLedgerEntry(value: Record<string, unknown>): LedgerEntry {
  const kind = stringValue(value.kind, "CONSUME");
  return {
    id: stringValue(value.id, uid("ledger")),
    ts: new Date(stringValue(value.createdAt)).getTime() || Date.now(),
    label: stringValue(value.reason, "Usage ledger entry"),
    credits: numberValue(value.amount),
    kind: kind === "TOPUP" ? "topup" : "image",
    state: kind.toLowerCase() as LedgerEntry["state"],
    runId: typeof value.runId === "string" ? value.runId : undefined,
    reservationId: typeof value.reservationId === "string" ? value.reservationId : undefined,
  };
}

const KEY = "creozentic-store-v2";
const LEGACY_KEY = "chitra-store-v1";

function load<T>(field: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return field in parsed ? parsed[field] : fallback;
  } catch {
    return fallback;
  }
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const backendEnabled = process.env.NEXT_PUBLIC_BACKEND_ENABLED === "true";
  const [role, setRole] = useState<Store["role"]>(backendEnabled ? "VIEWER" : "OWNER");
  const [brand, setBrand] = useState<Brand>(() => ({
    ...DEFAULT_BRAND,
    ...(backendEnabled ? {} : load("brand", {})),
  }));
  const [credits, setCredits] = useState<number>(() => load("credits", backendEnabled ? 0 : 1000));
  const [ledger, setLedger] = useState<LedgerEntry[]>(() =>
    load(
      "ledger",
      backendEnabled
        ? []
        : [
            {
              id: "l0",
              ts: Date.now() - 86400000,
              label: "Starter plan top-up",
              credits: 1000,
              kind: "topup" as const,
              state: "topup" as const,
            },
          ],
    ),
  );
  const [reservedCredits, setReservedCredits] = useState<number>(() => load("reservedCredits", 0));
  const [reservations, setReservations] = useState<Reservation[]>(() =>
    backendEnabled ? [] : load("reservations", []),
  );
  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRun[]>(() =>
    backendEnabled ? [] : load("workflowRuns", []),
  );
  const [reviewTasks, setReviewTasks] = useState<ReviewTask[]>(() =>
    backendEnabled ? [] : load("reviewTasks", []),
  );
  const [seats, setSeats] = useState<Seat[]>(() =>
    backendEnabled ? [] : load("seats", DEFAULT_SEATS),
  );
  const [done, setDone] = useState<Record<string, boolean>>(() =>
    backendEnabled
      ? {}
      : load("done", {
          "model-router": true,
          "workflow-engine": true,
          "canvas-chat": true,
        }),
  );
  const [audit, setAudit] = useState<AuditEvent[]>(() =>
    backendEnabled
      ? []
      : load("audit", [
          {
            id: "a0",
            ts: Date.now() - 3600000,
            actor: "Aarav Mehta",
            action: "approved",
            target: "Monsoon sofa pack · v2",
          },
          {
            id: "a1",
            ts: Date.now() - 7200000,
            actor: "Priya Nair",
            action: "exported",
            target: "Kadam sofa · 3 formats",
          },
        ]),
  );

  const workflowRunsRef = useRef(workflowRuns);
  const reservationsRef = useRef(reservations);
  const reviewTasksRef = useRef(reviewTasks);
  workflowRunsRef.current = workflowRuns;
  reservationsRef.current = reservations;
  reviewTasksRef.current = reviewTasks;

  useEffect(() => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        brand,
        credits,
        ledger,
        reservedCredits,
        reservations,
        workflowRuns,
        reviewTasks,
        seats,
        done,
        audit,
      }),
    );
  }, [
    brand,
    credits,
    ledger,
    reservedCredits,
    reservations,
    workflowRuns,
    reviewTasks,
    seats,
    done,
    audit,
  ]);

  const logAudit: Store["logAudit"] = (action, target, actor = "Aarav Mehta") =>
    setAudit((items) =>
      [{ id: uid("audit"), ts: Date.now(), actor, action, target }, ...items].slice(0, 40),
    );

  const spend: Store["spend"] = (label, amount, kind) => {
    if (amount > credits - reservedCredits) return false;
    setCredits((value) => value - amount);
    setLedger((items) => [
      {
        id: uid("ledger"),
        ts: Date.now(),
        label,
        credits: -amount,
        kind,
        state: "consume",
      },
      ...items,
    ]);
    return true;
  };

  const topup: Store["topup"] = (amount) => {
    setCredits((value) => value + amount);
    setLedger((items) => [
      {
        id: uid("ledger"),
        ts: Date.now(),
        label: `Top-up · ${amount} credits`,
        credits: amount,
        kind: "topup",
        state: "topup",
      },
      ...items,
    ]);
  };

  const createWorkflowRun: Store["createWorkflowRun"] = ({
    title,
    brief,
    brandVersion,
    quote,
    workspaceId = "workspace-autozentic-demo",
  }) => {
    if (quote.credits > credits - reservedCredits) return null;
    const now = Date.now();
    const runId = uid("run");
    const reservationId = uid("reservation");
    const reservation: Reservation = {
      id: reservationId,
      workspaceId,
      runId,
      amount: quote.credits,
      status: "reserved",
      createdAt: now,
    };
    const run: WorkflowRun = {
      id: runId,
      workspaceId,
      templateId: "product-photo-to-lifestyle",
      templateVersion: "v1.0.0",
      state: "reserved",
      title,
      brief,
      brandVersion,
      quote,
      reservationId,
      outputs: [],
      progress: { currentNode: "Reservation created", completed: 0, total: 5 },
      warnings: [],
      createdAt: now,
      updatedAt: now,
    };
    setReservedCredits((value) => value + quote.credits);
    setReservations((items) => [reservation, ...items]);
    setWorkflowRuns((items) => [run, ...items].slice(0, 40));
    setLedger((items) => [
      {
        id: uid("ledger"),
        ts: now,
        label: `Reserved · ${title}`,
        credits: 0,
        kind: "image",
        state: "reserve",
        runId,
        reservationId,
      },
      ...items,
    ]);
    logAudit("reserved", `${title} · ${quote.credits} credits`);
    return runId;
  };

  const updateWorkflowRun: Store["updateWorkflowRun"] = (id, patch) => {
    setWorkflowRuns((runs) =>
      runs.map((run) => (run.id === id ? { ...run, ...patch, updatedAt: Date.now() } : run)),
    );
  };

  const transitionWorkflowRun: Store["transitionWorkflowRun"] = (id, state, patch = {}) => {
    let accepted = false;
    setWorkflowRuns((runs) => {
      const current = runs.find((run) => run.id === id);
      if (!current || (!canTransition(current.state, state) && current.state !== state))
        return runs;
      accepted = true;
      return runs.map((run) =>
        run.id === id ? { ...run, ...patch, state, updatedAt: Date.now() } : run,
      );
    });
    return accepted;
  };

  const settleReservation = (
    runId: string,
    actualCredits: number,
    outcome: "settled" | "released",
  ) => {
    const reservation = reservationsRef.current.find(
      (item) => item.runId === runId && item.status === "reserved",
    );
    if (!reservation) return false;
    const actual = outcome === "settled" ? Math.min(actualCredits, reservation.amount) : 0;
    const now = Date.now();
    setReservedCredits((value) => Math.max(0, value - reservation.amount));
    if (actual > 0) setCredits((value) => Math.max(0, value - actual));
    setReservations((items) =>
      items.map((item) =>
        item.id === reservation.id ? { ...item, status: outcome, settledAt: now } : item,
      ),
    );
    setLedger((items) => [
      {
        id: uid("ledger"),
        ts: now,
        label:
          outcome === "settled"
            ? `Consumed · ${actual} credits`
            : "Released · failed run reservation",
        credits: outcome === "settled" ? -actual : 0,
        kind: "image",
        state: outcome === "settled" ? "consume" : "release",
        runId,
        reservationId: reservation.id,
      },
      ...items,
    ]);
    return true;
  };

  const completeWorkflowRun: Store["completeWorkflowRun"] = (id, outputs, verdicts) => {
    const run = workflowRunsRef.current.find((item) => item.id === id);
    if (!run || run.state !== "running") return false;
    const taskId = uid("review");
    const blocked = Object.values(verdicts).some((check) => check.verdict === "critical");
    const task: ReviewTask = {
      id: taskId,
      runId: id,
      workspaceId: run.workspaceId,
      title: run.title,
      brand: brand.name,
      version: `run ${id.slice(-8)} · brand v${run.brandVersion} · ${run.templateId}.${run.templateVersion}`,
      kind: "static",
      images: outputs.map((output) => output.imgId),
      outputs,
      status: "pending",
      verdicts,
      comments: [],
      requiredRoles: ["Editor", "Reviewer"],
      createdAt: Date.now(),
    };
    settleReservation(id, run.quote.credits, "settled");
    setReviewTasks((tasks) => [task, ...tasks].slice(0, 40));
    setWorkflowRuns((runs) =>
      runs.map((item) =>
        item.id === id
          ? {
              ...item,
              state: "awaiting_review",
              reviewTaskId: taskId,
              outputs,
              warnings: [
                ...item.warnings,
                ...(blocked ? ["Critical QA check failed; publishing is blocked."] : []),
              ],
              progress: {
                currentNode: "Human review checkpoint",
                completed: item.progress.total,
                total: item.progress.total,
              },
              updatedAt: Date.now(),
            }
          : item,
      ),
    );
    logAudit("queued for review", `${run.title} · ${id.slice(-8)}`);
    return true;
  };

  const cancelWorkflowRun: Store["cancelWorkflowRun"] = (id) => {
    const run = workflowRunsRef.current.find((item) => item.id === id);
    if (
      !run ||
      ["succeeded", "exported", "published", "cancelled", "terminal_failure"].includes(run.state)
    )
      return false;
    settleReservation(id, 0, "released");
    return transitionWorkflowRun(id, "cancelled", {
      error: "Cancelled by workspace member.",
    });
  };

  const decideReviewTask: Store["decideReviewTask"] = (id, status) => {
    const task = reviewTasksRef.current.find((item) => item.id === id);
    if (!task) return false;
    const blocked = Object.values(task.verdicts).some((check) => check.verdict === "critical");
    if (status === "approved" && blocked) return false;
    setReviewTasks((tasks) => tasks.map((item) => (item.id === id ? { ...item, status } : item)));
    if (status === "approved") {
      updateWorkflowRun(task.runId, { state: "approved" });
      logAudit("approved", task.title);
    } else if (status === "rejected") {
      updateWorkflowRun(task.runId, {
        state: "retryable_failure",
        error: "Rejected at human review checkpoint.",
      });
      logAudit("rejected", task.title);
    } else if (status === "refinement_requested") {
      logAudit("requested refinement", task.title);
    }
    return true;
  };

  const addReviewComment: Store["addReviewComment"] = (id, comment) => {
    setReviewTasks((tasks) =>
      tasks.map((task) =>
        task.id === id
          ? {
              ...task,
              comments: [
                ...task.comments,
                { ...comment, id: uid("comment"), createdAt: Date.now() },
              ],
            }
          : task,
      ),
    );
  };

  const exportWorkflowRun: Store["exportWorkflowRun"] = (id) => {
    const run = workflowRunsRef.current.find((item) => item.id === id);
    const task = reviewTasksRef.current.find((item) => item.runId === id);
    if (!run || !task || task.status !== "approved" || run.state !== "approved") return false;
    setWorkflowRuns((runs) =>
      runs.map((item) =>
        item.id === id
          ? {
              ...item,
              state: "exported",
              outputs: item.outputs.map((output) => ({
                ...output,
                status: "exported" as const,
              })),
              updatedAt: Date.now(),
            }
          : item,
      ),
    );
    setReviewTasks((tasks) =>
      tasks.map((item) =>
        item.id === task.id
          ? {
              ...item,
              outputs: item.outputs.map((output) => ({
                ...output,
                status: "exported" as const,
              })),
            }
          : item,
      ),
    );
    logAudit("exported", `${run.title} · manifest + ${run.outputs.length} formats`);
    return true;
  };

  const addSeat: Store["addSeat"] = (seat) =>
    setSeats((items) => [...items, { ...seat, id: uid("seat") }]);
  const removeSeat: Store["removeSeat"] = (id) =>
    setSeats((items) => items.filter((seat) => seat.id !== id));
  const toggleDone: Store["toggleDone"] = (id) =>
    setDone((items) => ({ ...items, [id]: !items[id] }));

  const refreshServerState: Store["refreshServerState"] = async () => {
    if (!backendEnabled) return;
    const state = await getServerState();
    if (state.workspace.role) setRole(state.workspace.role as Store["role"]);
    if (state.brand) {
      setBrand((current) => ({
        ...current,
        id: state.brand?.id ?? current.id,
        approvalStatus: state.brand?.approvalStatus ?? current.approvalStatus,
        ...state.brand?.profile,
        name: state.brand?.name ?? current.name,
        version: state.brand?.version ?? current.version,
      }));
    }
    if (state.credits) {
      setCredits(state.credits.balance);
      setReservedCredits(state.credits.reserved);
    }
    setLedger(state.ledger.map(toLocalLedgerEntry));
    setWorkflowRuns(state.runs.map(toLocalWorkflowRun).filter(Boolean) as WorkflowRun[]);
    setReviewTasks(state.reviews.map(toLocalReviewTask).filter(Boolean) as ReviewTask[]);
  };

  const startServerWorkflow: Store["startServerWorkflow"] = async (input) => {
    if (!backendEnabled) return { error: "Server mode is not enabled." };
    try {
      const result = await startServerRun(input);
      await refreshServerState();
      return { runId: String(result.run.id) };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "The server could not start this run.",
      };
    }
  };

  useEffect(() => {
    if (!backendEnabled) return;
    void refreshServerState().catch((error) =>
      console.error("Creozentic server state unavailable", error),
    );
  }, [backendEnabled]);

  return (
    <Ctx.Provider
      value={{
        backendEnabled,
        role,
        brand,
        setBrand,
        credits,
        ledger,
        spend,
        topup,
        reservedCredits,
        reservations,
        workflowRuns,
        reviewTasks,
        createWorkflowRun,
        updateWorkflowRun,
        transitionWorkflowRun,
        completeWorkflowRun,
        cancelWorkflowRun,
        decideReviewTask,
        addReviewComment,
        exportWorkflowRun,
        seats,
        addSeat,
        removeSeat,
        done,
        toggleDone,
        audit,
        logAudit,
        refreshServerState,
        startServerWorkflow,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useStore() {
  const context = useContext(Ctx);
  if (!context) throw new Error("useStore outside provider");
  return context;
}
