/* Professional-output scorecard — blueprint §19.3.
   A critical failure blocks publishing regardless of the weighted score. */

export type Verdict = "pass" | "warn" | "critical";

export type ScoreRow = {
  dim: string;
  staticW: number;
  videoW: number;
  gate: string;
  verdict: Verdict;
  repair?: string;
};

export const DIMENSIONS: Omit<ScoreRow, "verdict" | "repair">[] = [
  {
    dim: "Product / identity truth",
    staticW: 30,
    videoW: 25,
    gate: "Must pass — no critical mismatch",
  },
  { dim: "Brand rules & typography", staticW: 20, videoW: 15, gate: "Must pass locked fields" },
  {
    dim: "Message / claim correctness",
    staticW: 15,
    videoW: 15,
    gate: "Must pass legal/claims lint",
  },
  {
    dim: "Composition & platform fit",
    staticW: 15,
    videoW: 15,
    gate: "Must pass safe-area/preflight",
  },
  {
    dim: "Temporal / audio quality",
    staticW: 0,
    videoW: 20,
    gate: "Must pass for publishable video",
  },
  {
    dim: "Distinctiveness / authenticity",
    staticW: 10,
    videoW: 5,
    gate: "Warn — compare to recent assets",
  },
  {
    dim: "Technical export / rights",
    staticW: 10,
    videoW: 5,
    gate: "Must pass codec, metadata, consent",
  },
];

const V: Record<Verdict, { color: string; bg: string; label: string; dot: string }> = {
  pass: { color: "text-leaf", bg: "bg-leaf/12", label: "pass", dot: "bg-leaf" },
  warn: { color: "text-marigold", bg: "bg-marigold/12", label: "warn", dot: "bg-marigold" },
  critical: {
    color: "text-saffron-deep",
    bg: "bg-saffron-deep/12",
    label: "critical",
    dot: "bg-saffron-deep",
  },
};

export function weightedScore(rows: ScoreRow[], kind: "static" | "video") {
  const total = rows.reduce((s, r) => s + (kind === "static" ? r.staticW : r.videoW), 0);
  if (!total) return 0;
  const got = rows.reduce((s, r) => {
    const w = kind === "static" ? r.staticW : r.videoW;
    const factor = r.verdict === "pass" ? 1 : r.verdict === "warn" ? 0.6 : 0;
    return s + w * factor;
  }, 0);
  return Math.round((got / total) * 100);
}

export function hasCritical(rows: ScoreRow[]) {
  return rows.some((r) => r.verdict === "critical");
}

export default function ScoreCard({
  rows,
  kind = "static",
}: {
  rows: ScoreRow[];
  kind?: "static" | "video";
}) {
  const score = weightedScore(rows, kind);
  const blocked = hasCritical(rows);

  return (
    <div>
      <div className="mb-4 flex items-center gap-4">
        <div>
          <div className="font-display text-4xl font-medium">{score}</div>
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
            professional score · {kind}
          </div>
        </div>
        <div
          className={`rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.1em] ${
            blocked ? "bg-saffron-deep text-paper" : "bg-leaf text-paper"
          }`}
        >
          {blocked ? "Publish blocked" : "Publishable"}
        </div>
      </div>

      <div className="space-y-1">
        {rows.map((r) => {
          const w = kind === "static" ? r.staticW : r.videoW;
          const v = V[r.verdict];
          if (w === 0) return null;
          return (
            <div key={r.dim} className="rounded-lg border border-line px-3 py-2.5">
              <div className="flex items-center gap-3">
                <span className={`h-2 w-2 shrink-0 rounded-full ${v.dot}`} />
                <span className="flex-1 text-sm">{r.dim}</span>
                <span className="font-mono text-[10px] text-ink-soft">wt {w}</span>
                <span
                  className={`rounded px-2 py-0.5 font-mono text-[10px] uppercase ${v.bg} ${v.color}`}
                >
                  {v.label}
                </span>
              </div>
              {r.verdict !== "pass" && r.repair && (
                <div className="mt-1.5 pl-5 font-mono text-[11px] text-ink-soft">→ {r.repair}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
