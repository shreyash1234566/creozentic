import { REVISED_FEATURES, FOUNDATIONS, PRIORITY_META, type Priority } from "../data";
import { useStore } from "../store";
import { PageHeader, Panel } from "../ui";

const ORDER: Priority[] = ["P0", "P1", "P2", "P3", "Defer"];

const RELEASE_RULES = [
  "Nothing publishes publicly without passing the quality gate and a human decision.",
  "Every generation is versioned, costed and recoverable — no silent overwrites.",
  "A new node or workflow ships only after the outcome it improves is measured.",
  "Cost is quoted before work starts; margin is guarded per approved pack.",
  "Product-truth is an invariant — locked facts never change without an explicit creative mode.",
];

const SOURCE_OF_TRUTH = ["Locked facts", "Brief", "Template", "Model proposal", "Human decision"];

export default function Checklist({ go }: { go: (v: string) => void }) {
  const { done, toggleDone } = useStore();

  const total = REVISED_FEATURES.length;
  const live = REVISED_FEATURES.filter((f) => f.route).length;
  const ticked = REVISED_FEATURES.filter((f) => done[f.id]).length;

  const groups = ORDER.map((p) => ({
    p,
    items: REVISED_FEATURES.filter((f) => f.priority.startsWith(p)),
  })).filter((g) => g.items.length);

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Roadmap · customer-outcome-first edition"
        title="Feature status & priorities"
        desc="Blueprint v2.0 sequencing. Har feature ek measurable outcome improve kare — warna wait. Priority = kab build karna hai, release rule = kis condition pe ship hota hai."
        right={
          <div className="text-right">
            <div className="font-display text-3xl font-medium text-saffron-deep">
              {ticked}/{total}
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">
              ticked
            </div>
          </div>
        }
      />

      <div>
        <div className="mb-2 flex justify-between font-mono text-[11px] text-ink-soft">
          <span>{live} live in this build</span>
          <span>{Math.round((ticked / total) * 100)}% ticked</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-paper-deep">
          <div
            className="h-full rounded-full bg-saffron-deep transition-all"
            style={{ width: `${(ticked / total) * 100}%` }}
          />
        </div>
      </div>

      {/* source-of-truth hierarchy */}
      <Panel title="Source-of-truth hierarchy · resolves every conflict">
        <div className="flex flex-wrap items-center gap-2 p-5">
          {SOURCE_OF_TRUTH.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <span className="rounded-full border border-line bg-paper px-3 py-1.5 font-mono text-[11px]">
                {i + 1}. {s}
              </span>
              {i < SOURCE_OF_TRUTH.length - 1 && <span className="text-ink-soft">›</span>}
            </div>
          ))}
        </div>
      </Panel>

      {groups.map((group) => {
        const meta = PRIORITY_META[group.p];
        return (
          <div key={group.p}>
            <div className="mb-3 flex items-baseline gap-3">
              <span className={`font-display text-2xl font-medium ${meta.color}`}>{group.p}</span>
              <h2 className="font-mono text-xs uppercase tracking-[0.16em] text-ink-soft">
                {meta.label}
              </h2>
            </div>
            <Panel>
              {group.items.map((f) => {
                const on = done[f.id];
                return (
                  <div
                    key={f.id}
                    className="flex items-start gap-4 border-b border-line px-5 py-4 last:border-0"
                  >
                    <button
                      onClick={() => toggleDone(f.id)}
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                        on ? "border-leaf bg-leaf text-paper" : "border-line hover:border-ink"
                      }`}
                      aria-label={`Toggle ${f.feature}`}
                    >
                      {on && <span className="text-[12px]">✓</span>}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-sm font-medium ${on ? "text-ink-soft line-through" : ""}`}
                        >
                          {f.feature}
                        </span>
                        {f.priority !== group.p && (
                          <span className="font-mono text-[10px] text-ink-soft">
                            ({f.priority})
                          </span>
                        )}
                        {f.route && (
                          <span className="rounded-full bg-leaf/15 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-leaf">
                            live
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
                        <span className="text-ink">Release rule:</span> {f.rule}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span className="font-mono text-[10px] text-ink-soft">
                        orig ph. {f.origPhase}
                      </span>
                      {f.route && (
                        <button
                          onClick={() => go(f.route!)}
                          className="font-mono text-[11px] text-saffron-deep hover:underline"
                        >
                          open →
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </Panel>
          </div>
        );
      })}

      {/* added foundations */}
      <div>
        <div className="mb-3 flex items-baseline gap-3">
          <span className="font-display text-2xl font-medium text-indigo">+</span>
          <h2 className="font-display text-xl font-medium">
            Foundations the roadmap assumed but never named
          </h2>
        </div>
        <p className="mb-4 max-w-2xl text-sm text-ink-soft">
          Yeh flashy nahi hai, par inke bina baaki sab break hota hai. Product ki reliability inhi
          pe tiki hai.
        </p>
        <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
          {FOUNDATIONS.map((f) => (
            <div key={f.feature} className="bg-card px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{f.feature}</span>
                {f.route && (
                  <button
                    onClick={() => go(f.route!)}
                    className="font-mono text-[10px] text-saffron-deep hover:underline"
                  >
                    live →
                  </button>
                )}
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{f.why}</p>
            </div>
          ))}
        </div>
      </div>

      {/* release rules */}
      <div className="rounded-2xl border border-dashed border-line bg-card p-6">
        <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-indigo">
          Release invariants
        </div>
        <ul className="mt-3 space-y-2">
          {RELEASE_RULES.map((r) => (
            <li key={r} className="flex items-start gap-3 text-sm leading-relaxed text-ink-soft">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-saffron-deep" />
              {r}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
