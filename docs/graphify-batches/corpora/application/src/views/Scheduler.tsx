import { useEffect, useState } from "react";
import { PageHeader, Panel, Btn, Stat, PhaseTag } from "../ui";
import { useStore } from "../store";
import { createServerSchedule, getServerSchedules, updateServerSchedule } from "../client/api";

type Cadence = "daily" | "weekly" | "monthly" | "once";
type Status = "scheduled" | "paused" | "blocked" | "running";

type Run = {
  id: string;
  name: string;
  cadence: Cadence;
  next: string;
  formats: number;
  estCredits: number;
  ceiling: number;
  status: Status;
  destination: string;
};

const INITIAL: Run[] = [
  {
    id: "r1",
    name: "Weekly new-arrivals · furniture",
    cadence: "weekly",
    next: "Mon 09:00",
    formats: 12,
    estCredits: 96,
    ceiling: 150,
    status: "scheduled",
    destination: "Drive → /campaigns",
  },
  {
    id: "r2",
    name: "Daily WhatsApp status · offers",
    cadence: "daily",
    next: "Today 18:00",
    formats: 3,
    estCredits: 24,
    ceiling: 40,
    status: "scheduled",
    destination: "WhatsApp broadcast",
  },
  {
    id: "r3",
    name: "Diwali festive push · all SKUs",
    cadence: "once",
    next: "Oct 28 06:00",
    formats: 40,
    estCredits: 320,
    ceiling: 250,
    status: "blocked",
    destination: "Meta drafts",
  },
  {
    id: "r4",
    name: "Jewellery macro refresh",
    cadence: "monthly",
    next: "1st 07:00",
    formats: 8,
    estCredits: 64,
    ceiling: 120,
    status: "paused",
    destination: "Drive → /jewellery",
  },
];

/* receipts / run history — idempotent, no silent duplicates */
const RECEIPTS = [
  {
    id: "run_9f2a",
    name: "Weekly new-arrivals · furniture",
    ts: "Mon 09:00",
    credits: 92,
    outcome: "delivered",
    assets: 12,
    note: "12 assets → Drive · content-hash matched, 0 duplicates",
  },
  {
    id: "run_8c11",
    name: "Daily WhatsApp status · offers",
    ts: "Yesterday 18:00",
    credits: 24,
    outcome: "delivered",
    assets: 3,
    note: "sent to 1 broadcast list · receipt logged",
  },
  {
    id: "run_7b04",
    name: "Jewellery macro refresh",
    ts: "Oct 01 07:00",
    credits: 61,
    outcome: "rolled-back",
    assets: 8,
    note: "reviewer rejected 3 · run rolled back, credits refunded",
  },
];

const CADENCE_LABEL: Record<Cadence, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  once: "One-off",
};

function StatusPill({ s }: { s: Status }) {
  const map: Record<Status, string> = {
    scheduled: "bg-leaf text-paper",
    paused: "bg-paper-deep text-ink-soft",
    blocked: "bg-saffron-deep text-paper",
    running: "bg-indigo text-paper",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide ${map[s]}`}
    >
      {s}
    </span>
  );
}

function mapServerSchedule(schedule: Record<string, unknown>): Run {
  const payload = (schedule.requestPayload ?? {}) as { rows?: unknown[]; dailyAutopilot?: boolean };
  const rawStatus = String(schedule.status).toLowerCase();
  const status: Status =
    rawStatus === "paused"
      ? "paused"
      : rawStatus === "blocked"
        ? "blocked"
        : rawStatus === "running"
          ? "running"
          : rawStatus === "disabled"
            ? "paused"
            : "scheduled";
  return {
    id: String(schedule.id),
    name: String(schedule.name),
    cadence: String(schedule.cadence) as Cadence,
    next: schedule.nextRunAt
      ? new Date(String(schedule.nextRunAt)).toLocaleString("en-IN")
      : "not scheduled",
    formats: payload.dailyAutopilot ? 1 : Array.isArray(payload.rows) ? payload.rows.length : 0,
    estCredits: Number(schedule.costCeiling ?? 0),
    ceiling: Number(schedule.costCeiling ?? 0),
    status,
    destination: payload.dailyAutopilot
      ? "Daily Autopilot · approval inbox"
      : "Approved output / configured connector",
  };
}

export default function Scheduler() {
  const { logAudit, backendEnabled } = useStore();
  const [runs, setRuns] = useState<Run[]>(backendEnabled ? [] : INITIAL);
  const [ceilingDraft, setCeilingDraft] = useState<Record<string, number>>({});
  const [serverError, setServerError] = useState("");
  const [newName, setNewName] = useState("Daily Creative Autopilot");
  const [newCap, setNewCap] = useState(40);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!backendEnabled) return;
    void getServerSchedules()
      .then((schedules) => setRuns(schedules.map(mapServerSchedule)))
      .catch((error) =>
        setServerError(error instanceof Error ? error.message : "Schedules could not be loaded."),
      );
  }, [backendEnabled]);

  const createAutopilotSchedule = async () => {
    if (!backendEnabled || !newName.trim()) return;
    setCreating(true);
    setServerError("");
    try {
      const result = await createServerSchedule({
        name: newName.trim(),
        cadence: "daily",
        costCeiling: newCap,
        autonomyMode: "DAILY_AUTOPILOT",
        payload: { dailyAutopilot: true, autonomyMode: "APPROVAL", channel: "dashboard" },
        approvalRequired: true,
      });
      setRuns((current) => [mapServerSchedule(result.schedule), ...current]);
      logAudit("created daily autopilot schedule", newName.trim());
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "The schedule could not be created.");
    } finally {
      setCreating(false);
    }
  };

  const toggle = async (id: string) => {
    const current = runs.find((run) => run.id === id);
    if (!current || current.status === "blocked") return;
    const next: Status = current.status === "paused" ? "scheduled" : "paused";
    const nextServerStatus = next === "paused" ? "PAUSED" : "ACTIVE";
    setServerError("");
    setRuns((rs) => rs.map((r) => (r.id === id ? { ...r, status: next } : r)));
    try {
      if (backendEnabled) await updateServerSchedule(id, { status: nextServerStatus });
      logAudit(next === "paused" ? "paused scheduled run" : "resumed scheduled run", current.name);
    } catch (error) {
      setRuns((rs) => rs.map((r) => (r.id === id ? current : r)));
      setServerError(error instanceof Error ? error.message : "The schedule could not be updated.");
    }
  };

  const raiseCeiling = async (id: string) => {
    const current = runs.find((run) => run.id === id);
    if (!current) return;
    const newCeiling = ceilingDraft[id] ?? current.estCredits;
    const status: Status = newCeiling >= current.estCredits ? "scheduled" : "blocked";
    const updated = { ...current, ceiling: newCeiling, status };
    setServerError("");
    setRuns((rs) => rs.map((r) => (r.id === id ? updated : r)));
    try {
      if (backendEnabled)
        await updateServerSchedule(id, {
          costCeiling: newCeiling,
          status: status === "scheduled" ? "ACTIVE" : "BLOCKED",
        });
      if (status === "scheduled")
        logAudit("approved cost ceiling", `${current.name} · ₹${newCeiling} cap`);
    } catch (error) {
      setRuns((rs) => rs.map((r) => (r.id === id ? current : r)));
      setServerError(error instanceof Error ? error.message : "The schedule could not be updated.");
    }
  };

  const scheduledCount = runs.filter((r) => r.status === "scheduled").length;
  const blockedCount = runs.filter((r) => r.status === "blocked").length;
  const monthlyCredits = runs
    .filter((r) => r.status === "scheduled")
    .reduce((s, r) => s + r.estCredits, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Phase 4 · Scheduled & API runs"
        title="Calendar & publish"
        desc="Recurring aur API runs cost ceilings ke saath — koi run apni cap cross kare toh block hokar approval maangta hai, chupke se spend nahi hota. Har run idempotent hai (content-hash se duplicates rukte hain), receipts deta hai, aur rollback ho sakta hai."
        right={
          <Btn onClick={() => logAudit("opened schedule builder", "new run")}>+ New schedule</Btn>
        }
      />

      {serverError && <p className="font-mono text-[11px] text-saffron-deep">{serverError}</p>}

      <Panel title="Daily Autopilot schedule">
        <div className="flex flex-wrap items-end gap-4 p-5">
          <label className="min-w-[220px] flex-1">
            <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">
              Schedule name
            </span>
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-saffron-deep"
            />
          </label>
          <label>
            <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">
              Credit ceiling
            </span>
            <input
              type="number"
              min={1}
              value={newCap}
              onChange={(event) => setNewCap(Math.max(1, Number(event.target.value) || 1))}
              className="w-28 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-saffron-deep"
            />
          </label>
          <Btn onClick={createAutopilotSchedule} disabled={!backendEnabled || creating}>
            {creating ? "Creating…" : "Schedule daily plan"}
          </Btn>
        </div>
      </Panel>

      <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
        <Stat label="Active schedules" value={String(scheduledCount)} sub="running to plan" />
        <Stat label="Blocked by ceiling" value={String(blockedCount)} sub="needs approval" />
        <Stat label="Est. credits / cycle" value={String(monthlyCredits)} sub="within budget" />
        <Stat label="Silent duplicates" value="0" sub="idempotent by hash" />
      </div>

      <Panel title="Schedule queue">
        <div className="divide-y divide-line">
          {runs.map((r) => {
            const over = r.estCredits > r.ceiling;
            return (
              <div key={r.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <StatusPill s={r.status} />
                    <div>
                      <div className="text-sm font-medium">{r.name}</div>
                      <div className="font-mono text-[10px] text-ink-soft">
                        {CADENCE_LABEL[r.cadence]} · next {r.next} · {r.destination}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-5">
                    <div className="text-right">
                      <div className="font-mono text-[10px] uppercase text-ink-soft">est / cap</div>
                      <div
                        className={`font-display text-lg font-medium ${over ? "text-saffron-deep" : "text-ink"}`}
                      >
                        {r.estCredits}
                        <span className="font-sans text-xs font-normal text-ink-soft">
                          {" "}
                          / {r.ceiling} cr
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-[10px] uppercase text-ink-soft">formats</div>
                      <div className="font-display text-lg font-medium">{r.formats}</div>
                    </div>
                    {r.status !== "blocked" && (
                      <Btn variant="line" onClick={() => toggle(r.id)}>
                        {r.status === "paused" ? "Resume" : "Pause"}
                      </Btn>
                    )}
                  </div>
                </div>

                {r.status === "blocked" && (
                  <div className="mt-3 rounded-xl border border-saffron-deep/40 bg-saffron-deep/5 p-4">
                    <div className="text-sm font-medium text-saffron-deep">
                      ⚠ Estimated {r.estCredits} cr exceeds the {r.ceiling} cr ceiling — run held
                      for approval.
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 font-mono text-[11px] text-ink-soft">
                        Raise ceiling to
                        <input
                          type="number"
                          defaultValue={r.estCredits}
                          onChange={(e) =>
                            setCeilingDraft((d) => ({ ...d, [r.id]: Number(e.target.value) }))
                          }
                          className="w-24 rounded-lg border border-line bg-paper px-2 py-1 font-mono text-[12px] text-ink"
                        />
                        cr
                      </label>
                      <Btn onClick={() => raiseCeiling(r.id)}>Approve & schedule</Btn>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Panel title="Run receipts · history">
          <div className="divide-y divide-line">
            {(backendEnabled ? [] : RECEIPTS).map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-4 px-5 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{r.name}</span>
                    <span className="font-mono text-[9px] uppercase text-ink-soft">{r.id}</span>
                  </div>
                  <div className="mt-1 font-mono text-[10px] leading-relaxed text-ink-soft">
                    {r.ts} · {r.credits} cr · {r.assets} assets · {r.note}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide ${
                    r.outcome === "delivered" ? "bg-leaf text-paper" : "bg-paper-deep text-ink-soft"
                  }`}
                >
                  {r.outcome}
                </span>
              </div>
            ))}
            {backendEnabled && (
              <div className="px-5 py-8 text-sm text-ink-soft">
                Server publish receipts will appear here after a scheduled run produces a delivery
                receipt.
              </div>
            )}
          </div>
        </Panel>

        <Panel title="Run guardrails">
          <div className="space-y-3 p-5">
            {[
              ["Cost ceiling per run", "No run spends past its cap without explicit approval."],
              [
                "Idempotent by content-hash",
                "Re-runs skip identical assets — no silent duplicates.",
              ],
              [
                "Approval before publish",
                "Auto-runs deliver to drafts; publishing stays human-gated.",
              ],
              ["Rollback + refund", "A rejected run rolls back and refunds unused credits."],
            ].map(([t, d]) => (
              <div key={t} className="flex items-start gap-3">
                <span className="mt-0.5 text-leaf">✓</span>
                <div>
                  <div className="text-[13px] font-medium">{t}</div>
                  <div className="font-mono text-[10px] leading-relaxed text-ink-soft">{d}</div>
                </div>
              </div>
            ))}
            <div className="pt-2">
              <PhaseTag phase="Phase 4 · exit gate" />
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
