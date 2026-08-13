import { PageHeader, Panel, Btn, Stat } from "../ui";
import { useStore } from "../store";

const MODES = [
  {
    route: "daily",
    name: "Daily Creative Autopilot",
    job: "Owner / agency operator",
    desc: "Brief → plan → produce → check → approve → publish → learn, with durable pauses for missing facts and human review.",
    live: true,
  },
  {
    route: "productlock",
    name: "Product-Lock Studio",
    job: "Business / D2C owner",
    desc: "Catalogue product → controlled scene variants with the real product, text and colour intact.",
    live: true,
  },
  {
    route: "batch",
    name: "Brand Campaign System",
    job: "Agency owner / team",
    desc: "One approved concept → post, story, reel, ad, language and market variants via versioned templates.",
    live: true,
  },
  {
    route: "composer",
    name: "Authentic Edit",
    job: "Social creator",
    desc: "Real source clip → hook, captions, cover, b-roll and platform exports. Real media stays the source of truth.",
    live: true,
  },
  {
    route: "video",
    name: "UGC Ad Studio",
    job: "Performance marketer",
    desc: "Brief → script, storyboard, consented creator/voice, overlays and multiple hooks. Real footage first.",
    live: true,
  },
];

const LOOP = [
  "Brief + assets",
  "Understand brand",
  "Controlled variants",
  "Quality & policy QA",
  "Human approval",
  "Export / publish",
  "Performance",
];

export default function Overview({ go }: { go: (v: string) => void }) {
  const { brand, credits, reservedCredits, ledger, workflowRuns, reviewTasks } = useStore();
  const approved = workflowRuns.filter((run) =>
    ["approved", "succeeded", "exported", "published"].includes(run.state),
  ).length;
  const reviewed = reviewTasks.filter((task) => task.status === "approved").length;
  const firstPass = reviewTasks.length
    ? Math.round(
        (reviewTasks.filter(
          (task) => !Object.values(task.verdicts).some((check) => check.verdict === "critical"),
        ).length /
          reviewTasks.length) *
          100,
      )
    : 0;
  const consumed = ledger
    .filter((entry) => entry.state === "consume" && entry.credits < 0)
    .reduce((sum, entry) => sum + Math.abs(entry.credits), 0);
  const costPerApproved = approved ? Math.round(consumed / approved) : 0;

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Creozentic · creative reliability system"
        title={`Namaste — ${brand.name}`}
        desc="Aap image, video ya model nahi khareed rahe — aap brief se approved, on-brand, platform-ready pack tak ka bharosemand raasta khareed rahe ho. Pick an outcome; the router picks the model."
        right={<Btn onClick={() => go("productlock")}>New campaign pack</Btn>}
      />

      {/* north-star metrics */}
      <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
        <Stat
          label="Approved packs / mo"
          value={String(approved)}
          sub={`${reviewed} human approvals`}
        />
        <Stat
          label="First-run acceptance"
          value={`${firstPass}%`}
          sub="critical failures blocked"
        />
        <Stat
          label="Cost / approved pack"
          value={costPerApproved ? `${costPerApproved} cr` : "—"}
          sub="reservation settled"
        />
        <Stat
          label="Credit balance"
          value={credits.toLocaleString("en-IN")}
          sub={`${reservedCredits} reserved · ${workflowRuns.length} runs`}
        />
      </div>

      {/* four product modes — outcome-first entry */}
      <div>
        <div className="mb-4 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">
          Start from an outcome — not a blank canvas
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {MODES.map((m) => (
            <button
              key={m.route}
              onClick={() => go(m.route)}
              className="group rounded-2xl border border-line bg-card p-6 text-left transition-colors hover:border-saffron-deep hover:bg-paper-deep"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-saffron-deep">
                  {m.job}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide ${
                    m.live ? "bg-leaf/15 text-leaf" : "bg-paper-deep text-ink-soft"
                  }`}
                >
                  {m.live ? "live" : "phase 2"}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <h3 className="font-display text-2xl font-medium">{m.name}</h3>
                <span className="text-ink-soft transition-transform group-hover:translate-x-1">
                  →
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{m.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* core loop */}
      <Panel title="The core loop · every feature must improve one measure">
        <div className="flex flex-wrap items-center gap-2 p-5">
          {LOOP.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <span className="rounded-full border border-line bg-paper px-3 py-1.5 font-mono text-[11px]">
                {s}
              </span>
              {i < LOOP.length - 1 && <span className="text-ink-soft">→</span>}
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Non-negotiable principles">
          <ul className="space-y-3 p-5">
            {[
              "Outcome before model · brief before prompt",
              "Product truth is an invariant — locked facts never silently change",
              "Human control before public publishing",
              "Cost is visible before work starts",
              "Every generation is recoverable & tenant-isolated",
            ].map((p) => (
              <li key={p} className="flex items-start gap-3 text-sm text-ink-soft">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-saffron-deep" />
                {p}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title="Recent activity"
          right={
            <button
              onClick={() => go("review")}
              className="font-mono text-[11px] text-saffron-deep hover:underline"
            >
              review inbox →
            </button>
          }
        >
          <div className="max-h-[240px] overflow-y-auto">
            {ledger.slice(0, 7).map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between border-b border-line px-5 py-3 text-sm last:border-0"
              >
                <span className="truncate pr-3 text-ink-soft">{l.label}</span>
                <span
                  className={`shrink-0 font-mono text-[12px] ${
                    l.credits < 0 ? "text-ink" : "text-leaf"
                  }`}
                >
                  {l.credits > 0 ? "+" : ""}
                  {l.credits}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
