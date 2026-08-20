import { Panel } from "../ui";

type PassportItem = {
  state?: string;
  label?: string;
  source?: unknown;
};

export default function CreativePassport({
  passport,
  compact = false,
}: {
  passport?: Record<string, unknown> | null;
  compact?: boolean;
}) {
  const evidence = (passport?.evidence ?? {}) as Record<string, unknown>;
  const entries = [
    ["Product proof", evidence.product],
    ["Offer & facts", evidence.offer],
    ["Brand match", evidence.brand],
    ["Copy & claims", evidence.copy],
    ["Platform fit", evidence.platform],
    ["Rights & disclosure", evidence.rights],
    ["Output & QA", evidence.output ?? evidence.quality],
    ["Template & localization", evidence.template ?? evidence.localization],
    ["Human review", evidence.review],
  ] as const;
  const status = String(passport?.status ?? "NOT_COMPUTED");
  return (
    <Panel
      title="Creative Passport"
      right={
        <span
          className={`rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] ${status === "READY" ? "bg-leaf/15 text-leaf" : "bg-marigold/20 text-ink"}`}
        >
          {status.replace(/_/g, " ")}
        </span>
      }
    >
      <div className={`grid gap-2 ${compact ? "p-3" : "p-5"} sm:grid-cols-2`}>
        {entries.map(([name, raw]) => {
          const item = (raw ?? {}) as PassportItem;
          const state = String(item.state ?? "needs_input");
          const good = state === "pass" || state === "not_applicable";
          return (
            <div key={name} className="rounded-lg border border-line bg-paper px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full font-mono text-[11px] ${good ? "bg-leaf/15 text-leaf" : state === "blocked" ? "bg-saffron-deep/15 text-saffron-deep" : "bg-marigold/20 text-ink"}`}
                >
                  {good ? "✓" : state === "blocked" ? "!" : "?"}
                </span>
                <span className="text-[12px] font-medium">{name}</span>
              </div>
              <p className="mt-1 pl-7 text-[11px] leading-relaxed text-ink-soft">
                {item.label ?? "Evidence is not available yet."}
              </p>
            </div>
          );
        })}
      </div>
      {!passport && (
        <p className="border-t border-line px-5 py-3 font-mono text-[10px] text-ink-soft">
          Passport is computed by the server after facts, source assets, brand version, and QA
          evidence are available.
        </p>
      )}
      {passport && (
        <div className="flex flex-wrap justify-between gap-2 border-t border-line px-5 py-3 font-mono text-[10px] text-ink-soft">
          <span>Evidence version v{String(passport.version ?? "—")}</span>
          <span>
            Computed{" "}
            {passport.computedAt
              ? new Date(String(passport.computedAt)).toLocaleString("en-IN")
              : "—"}
          </span>
        </div>
      )}
    </Panel>
  );
}
