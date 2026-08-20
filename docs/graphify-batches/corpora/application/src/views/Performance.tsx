import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { PageHeader, Panel, Btn, Stat } from "../ui";
import { useStore } from "../store";
import {
  getServerPerformance,
  getServerPerformanceRecommendations,
  refreshServerPerformanceRecommendations,
  updateServerPerformanceRecommendation,
} from "../client/api";

/* ── attribute performance (which creative choices drive results) ── */
type Attr = { attr: string; kind: string; ctr: number; hold: number; conv: number; lift: number };
const ATTRS: Attr[] = [
  { attr: "POV hook (first 1.5s)", kind: "hook", ctr: 5.6, hold: 61, conv: 2.4, lift: 38 },
  { attr: "Room-scale lifestyle scene", kind: "scene", ctr: 4.8, hold: 54, conv: 2.1, lift: 22 },
  { attr: "Price-on-frame overlay", kind: "caption", ctr: 4.1, hold: 49, conv: 2.7, lift: 17 },
  { attr: "Studio white background", kind: "scene", ctr: 3.2, hold: 41, conv: 1.6, lift: -9 },
  { attr: 'Generic "shop now" CTA', kind: "cta", ctr: 2.9, hold: 38, conv: 1.4, lift: -14 },
];

/* ── template version performance ── */
const TEMPLATES = [
  { name: "Furniture · lifestyle set", v: "v3", prev: "v2", ctr: 4.9, delta: +0.8, packs: 42 },
  { name: "Jewellery · macro hero", v: "v2", prev: "v1", ctr: 3.7, delta: +0.3, packs: 28 },
  { name: "Real-estate · walkthrough", v: "v1", prev: "—", ctr: 3.1, delta: 0, packs: 11 },
];

/* ── fatigue / similarity detection ── */
const FATIGUE = [
  {
    name: "Diwali sofa reel · Hook A",
    runs: 6,
    trend: [5.4, 5.1, 4.6, 4.0, 3.4, 2.9],
    verdict: "fatiguing",
  },
  { name: "Boucle armchair · studio", runs: 4, trend: [3.3, 3.2, 3.1, 3.0], verdict: "flat" },
  { name: "Modular set · POV", runs: 2, trend: [5.2, 5.6], verdict: "fresh" },
];

/* ── recommendations that change a decision ── */
type Rec = { title: string; because: string; action: string };
const RECS: Rec[] = [
  {
    title: "Route furniture hooks to POV template v3",
    because: "POV hooks show +38% CTR lift across 42 approved packs",
    action: "Set as default for furniture",
  },
  {
    title: 'Retire "studio white" scene for lifestyle',
    because: "White-bg scenes trend −9% vs room-scale over last 30 days",
    action: "Demote in scene picker",
  },
  {
    title: 'Refresh "Diwali sofa reel · Hook A"',
    because: "CTR fell 5.4% → 2.9% over 6 runs — fatigue detected",
    action: "Generate 3 fresh hook variants",
  },
];

function Bar({
  value,
  max,
  tone = "saffron",
}: {
  value: number;
  max: number;
  tone?: "saffron" | "leaf" | "indigo";
}) {
  const c = { saffron: "bg-saffron-deep", leaf: "bg-leaf", indigo: "bg-indigo" }[tone];
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-paper-deep">
      <motion.div
        className={`h-full rounded-full ${c}`}
        initial={{ width: 0 }}
        whileInView={{ width: `${(value / max) * 100}%` }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      />
    </div>
  );
}

function Spark({ points, tone }: { points: number[]; tone: string }) {
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const w = 96;
  const h = 28;
  const d = points
    .map((p, i) => `${(i / (points.length - 1)) * w},${h - ((p - min) / range) * h}`)
    .join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline
        points={d}
        fill="none"
        stroke={tone}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={w} cy={h - ((points[points.length - 1] - min) / range) * h} r="2.5" fill={tone} />
    </svg>
  );
}

export default function Performance() {
  const { logAudit, backendEnabled } = useStore();
  const [imported, setImported] = useState(true);
  const [applied, setApplied] = useState<Record<string, boolean>>({});
  const [decision, setDecision] = useState<Record<string, "APPLIED" | "DISMISSED" | "MUTED">>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [actionDrafts, setActionDrafts] = useState<Record<string, string>>({});
  const [serverRecommendations, setServerRecommendations] = useState<
    Array<Record<string, unknown>>
  >([]);
  const [serverMetrics, setServerMetrics] = useState<
    Awaited<ReturnType<typeof getServerPerformance>>
  >([]);
  const [serverError, setServerError] = useState("");
  const displayedAttrs = backendEnabled ? [] : ATTRS;
  const displayedTemplates = backendEnabled ? [] : TEMPLATES;
  const displayedFatigue = backendEnabled ? [] : FATIGUE;
  const maxCtr = Math.max(...displayedAttrs.map((a) => a.ctr), 1);

  useEffect(() => {
    if (!backendEnabled) return;
    void Promise.all([getServerPerformance(), getServerPerformanceRecommendations()])
      .then(([metrics, recommendations]) => {
        setServerMetrics(metrics);
        setServerRecommendations(recommendations);
      })
      .catch((error) =>
        setServerError(
          error instanceof Error ? error.message : "Performance data could not be loaded.",
        ),
      );
  }, [backendEnabled]);

  const average = (metric: string) => {
    const item = serverMetrics.find((entry) => entry.metric.toLowerCase() === metric.toLowerCase());
    return item?._avg.value ?? null;
  };

  const displayedRecommendations = backendEnabled
    ? serverRecommendations.map((recommendation) => ({
        id: String(recommendation.id),
        title: String(recommendation.title),
        because: String(recommendation.rationale),
        action: String(recommendation.action),
        metric: String(recommendation.metric ?? "workspace signal"),
        evidence:
          recommendation.evidence && typeof recommendation.evidence === "object"
            ? (recommendation.evidence as Record<string, unknown>)
            : {},
      }))
    : RECS.map((recommendation, index) => ({
        ...recommendation,
        id: String(index),
        metric: "local preview",
        evidence: {},
      }));

  const setRecommendationDecision = async (
    id: string,
    status: "APPLIED" | "DISMISSED",
    action: string,
  ) => {
    try {
      if (
        backendEnabled &&
        serverRecommendations.some((recommendation) => String(recommendation.id) === id)
      ) {
        await updateServerPerformanceRecommendation(id, { status });
      } else {
        logAudit(
          status === "APPLIED"
            ? "applied performance recommendation"
            : "dismissed performance recommendation",
          action,
        );
      }
      setDecision((current) => ({ ...current, [id]: status }));
      if (status === "APPLIED") setApplied((current) => ({ ...current, [id]: true }));
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Recommendation update failed.");
    }
  };

  const muteRecommendation = async (id: string, action: string) => {
    try {
      if (
        backendEnabled &&
        serverRecommendations.some((recommendation) => String(recommendation.id) === id)
      ) {
        await updateServerPerformanceRecommendation(id, { status: "DISMISSED", optOut: true });
      } else {
        logAudit("muted performance recommendation", action);
      }
      setDecision((current) => ({ ...current, [id]: "MUTED" }));
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Recommendation could not be muted.");
    }
  };

  const saveEditedAction = async (id: string, action: string) => {
    if (!action.trim()) return;
    try {
      if (
        backendEnabled &&
        serverRecommendations.some((recommendation) => String(recommendation.id) === id)
      ) {
        await updateServerPerformanceRecommendation(id, { status: "OPEN", action: action.trim() });
        setServerRecommendations((current) =>
          current.map((recommendation) =>
            String(recommendation.id) === id
              ? { ...recommendation, action: action.trim() }
              : recommendation,
          ),
        );
      } else {
        logAudit("edited performance recommendation", action.trim());
      }
      setEditingId(null);
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Recommendation edit failed.");
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Phase 4 · Performance & learning"
        title="What to make next"
        desc="Kaunsa creative actually kaam kar raha hai — CTR, hold-rate aur conversion linked to creative attributes and template versions. Fatigue auto-detect hota hai, aur har recommendation ek concrete decision badalta hai. Data controlled decisions improve karta hai, guesswork nahi."
        right={
          <Btn
            onClick={() => {
              if (backendEnabled) {
                void Promise.all([
                  getServerPerformance(),
                  refreshServerPerformanceRecommendations(),
                ])
                  .then(([metrics, recommendations]) => {
                    setServerMetrics(metrics);
                    setServerRecommendations(recommendations);
                    setImported(true);
                    setServerError("");
                  })
                  .catch((error) =>
                    setServerError(
                      error instanceof Error
                        ? error.message
                        : "Performance data could not be loaded.",
                    ),
                  );
                return;
              }
              setImported(true);
              logAudit("imported performance data", "Meta + Instagram · last 30 days");
            }}
          >
            {imported ? "Re-sync performance data" : "Import performance data"}
          </Btn>
        }
      />

      {serverError && <p className="font-mono text-[11px] text-saffron-deep">{serverError}</p>}

      <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
        <Stat
          label="Approved packs / mo"
          value={
            backendEnabled && average("approved_packs") === null
              ? "—"
              : average("approved_packs") === null
                ? "128"
                : String(Math.round(average("approved_packs")!))
          }
          sub={backendEnabled ? "workspace data" : "north-star ↑ 14%"}
        />
        <Stat
          label="Cost / approved pack"
          value={backendEnabled ? "—" : "₹84"}
          sub={backendEnabled ? "awaiting cost observations" : "guardrail ≤ ₹120"}
        />
        <Stat
          label="Avg CTR (30d)"
          value={
            average("ctr") === null
              ? backendEnabled
                ? "—"
                : "4.2%"
              : `${average("ctr")!.toFixed(2)}%`
          }
          sub={backendEnabled ? "imported observations" : "benchmark 3.1%"}
        />
        <Stat
          label="Fatigue alerts"
          value={backendEnabled ? "—" : "2"}
          sub={backendEnabled ? "awaiting linked runs" : "needs refresh"}
        />
      </div>

      {backendEnabled && serverMetrics.length > 0 && (
        <div className="rounded-xl border border-line px-5 py-3 font-mono text-[10px] text-ink-soft">
          {serverMetrics.length} metric series loaded from tenant-scoped performance observations.
          Recommendations remain advisory and do not rewrite brand rules automatically.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* attribute leaderboard */}
        <Panel
          title="What drives results · creative attributes"
          right={<span className="font-mono text-[11px] text-ink-soft">by predicted CTR</span>}
        >
          <div className="divide-y divide-line">
            {displayedAttrs.length === 0 ? (
              <div className="px-5 py-8 text-sm text-ink-soft">
                No tenant-scoped creative attribute observations are available yet.
              </div>
            ) : (
              displayedAttrs.map((a) => (
                <div
                  key={a.attr}
                  className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{a.attr}</span>
                      <span className="rounded-full border border-line px-1.5 py-0.5 font-mono text-[9px] uppercase text-ink-soft">
                        {a.kind}
                      </span>
                    </div>
                    <div className="mt-1.5">
                      <Bar value={a.ctr} max={maxCtr} tone={a.lift >= 0 ? "saffron" : "indigo"} />
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-display text-lg font-medium">{a.ctr}%</div>
                    <div
                      className={`font-mono text-[10px] ${a.lift >= 0 ? "text-leaf" : "text-saffron-deep"}`}
                    >
                      {a.lift >= 0 ? "↑" : "↓"} {Math.abs(a.lift)}% lift
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="border-t border-line px-5 py-3 font-mono text-[10px] text-ink-soft">
            Attributes linked to template versions · public/permitted data only · never automated
            copying
          </div>
        </Panel>

        {/* template versions */}
        <Panel title="Template version performance">
          <div className="space-y-3 p-4">
            {displayedTemplates.length === 0 ? (
              <div className="p-5 text-sm text-ink-soft">
                Template performance appears after publishing receipts and linked metrics are
                imported.
              </div>
            ) : (
              displayedTemplates.map((t) => (
                <div key={t.name} className="rounded-xl border border-line px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{t.name}</span>
                    <span className="font-mono text-[10px] text-ink-soft">
                      {t.prev} → <span className="text-ink">{t.v}</span>
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="font-display text-xl font-medium text-saffron-deep">
                      {t.ctr}%
                    </span>
                    <span
                      className={`font-mono text-[11px] ${t.delta > 0 ? "text-leaf" : "text-ink-soft"}`}
                    >
                      {t.delta > 0 ? `+${t.delta}% vs ${t.prev}` : "baseline"}
                    </span>
                    <span className="font-mono text-[10px] text-ink-soft">{t.packs} packs</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>

      {/* fatigue detection */}
      <Panel
        title="Similarity & fatigue detection"
        right={<span className="font-mono text-[11px] text-ink-soft">rolling CTR per run</span>}
      >
        <div className="divide-y divide-line">
          {displayedFatigue.length === 0 ? (
            <div className="px-5 py-8 text-sm text-ink-soft">
              Fatigue detection requires multiple linked delivery observations for the same creative
              family.
            </div>
          ) : (
            displayedFatigue.map((f) => {
              const tone =
                f.verdict === "fatiguing"
                  ? "#a6410a"
                  : f.verdict === "flat"
                    ? "#574d3d"
                    : "#4a6b3f";
              return (
                <div key={f.name} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div>
                    <div className="text-sm font-medium">{f.name}</div>
                    <div className="font-mono text-[10px] text-ink-soft">{f.runs} runs</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Spark points={f.trend} tone={tone} />
                    <span
                      className={`w-20 rounded-full px-2 py-1 text-center font-mono text-[9px] uppercase tracking-wide ${
                        f.verdict === "fatiguing"
                          ? "bg-saffron-deep text-paper"
                          : f.verdict === "flat"
                            ? "bg-paper-deep text-ink-soft"
                            : "bg-leaf text-paper"
                      }`}
                    >
                      {f.verdict}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Panel>

      {/* recommendations */}
      <Panel title="Recommendations that change a decision">
        <div className="grid gap-3 p-4 md:grid-cols-3">
          {displayedRecommendations.map((r) => (
            <div key={r.id} className="flex flex-col rounded-xl border border-line bg-paper p-4">
              <div className="text-sm font-medium leading-snug">{r.title}</div>
              <div className="mt-2 flex-1 font-mono text-[10px] leading-relaxed text-ink-soft">
                Because: {r.because}
              </div>
              <div className="mt-3 rounded-lg bg-paper-deep px-3 py-2 font-mono text-[9px] text-ink-soft">
                <div>Evidence: {r.metric}</div>
                {Object.keys(r.evidence).length > 0 && (
                  <div className="mt-1">
                    {Object.entries(r.evidence)
                      .slice(0, 3)
                      .map(([key, value]) => key + ": " + String(value))
                      .join(" · ")}
                  </div>
                )}
                <div className="mt-1">
                  Action stays human-controlled; brand rules are not rewritten automatically.
                </div>
              </div>
              <Btn
                variant={decision[r.id] === "APPLIED" ? "ghost" : "line"}
                disabled={Boolean(decision[r.id])}
                className="mt-3 w-full"
                onClick={() => void setRecommendationDecision(r.id, "APPLIED", r.action)}
              >
                {decision[r.id] === "APPLIED" ? "✓ Applied" : r.action}
              </Btn>
              {editingId === r.id ? (
                <div className="mt-2 flex gap-2">
                  <input
                    value={actionDrafts[r.id] ?? r.action}
                    onChange={(event) =>
                      setActionDrafts((current) => ({ ...current, [r.id]: event.target.value }))
                    }
                    className="min-w-0 flex-1 rounded border border-line bg-paper px-2 py-1 font-mono text-[10px]"
                  />
                  <button
                    className="rounded border border-line px-2 py-1 font-mono text-[9px] uppercase"
                    onClick={() => void saveEditedAction(r.id, actionDrafts[r.id] ?? r.action)}
                  >
                    Save
                  </button>
                </div>
              ) : (
                <button
                  className="mt-2 rounded border border-line px-2 py-1 font-mono text-[9px] uppercase text-ink-soft"
                  disabled={Boolean(decision[r.id])}
                  onClick={() => {
                    setEditingId(r.id);
                    setActionDrafts((current) => ({ ...current, [r.id]: r.action }));
                  }}
                >
                  Edit action
                </button>
              )}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  className="rounded border border-line px-2 py-1 font-mono text-[9px] uppercase text-ink-soft"
                  disabled={Boolean(decision[r.id])}
                  onClick={() => void setRecommendationDecision(r.id, "DISMISSED", r.action)}
                >
                  {decision[r.id] === "DISMISSED" ? "Dismissed" : "Dismiss"}
                </button>
                <button
                  className="rounded border border-line px-2 py-1 font-mono text-[9px] uppercase text-ink-soft"
                  disabled={Boolean(decision[r.id])}
                  onClick={() => void muteRecommendation(r.id, r.action)}
                >
                  {decision[r.id] === "MUTED" ? "Muted" : "Mute"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
