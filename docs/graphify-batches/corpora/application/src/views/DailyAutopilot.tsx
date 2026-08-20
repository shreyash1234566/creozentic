import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import {
  approveServerDailyPlan,
  createServerCreativeRequest,
  createServerDailyPlan,
  exportServerDailyPlan,
  getServerDailyPlans,
  getServerDailyPlan,
  getServerAgencyMetrics,
  getServerAgencyQueue,
  updateServerAgencyItem,
  getServerCalendar,
  generateServerCalendar,
  reviseServerDailyPlan,
  runServerDailyPlan,
} from "../client/api";
import { Btn, PageHeader, Panel, PhaseTag } from "../ui";

type AnyRecord = Record<string, unknown>;

function record(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as AnyRecord) : {};
}

function list(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function DailyAutopilot() {
  const { backendEnabled } = useStore();
  const [plans, setPlans] = useState<AnyRecord[]>([]);
  const [selected, setSelected] = useState<AnyRecord | null>(null);
  const [planDate, setPlanDate] = useState(today());
  const [mode, setMode] = useState("APPROVAL");
  const [request, setRequest] = useState("");
  const [revision, setRevision] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [calendar, setCalendar] = useState<AnyRecord[]>([]);
  const [agency, setAgency] = useState<Record<string, number> | null>(null);
  const [agencyQueue, setAgencyQueue] = useState<AnyRecord[]>([]);
  const [agencyBrandFilter, setAgencyBrandFilter] = useState("");

  const load = async () => {
    if (!backendEnabled) return;
    setError("");
    try {
      const result = await getServerDailyPlans();
      setPlans(result);
      const [calendarResult, agencyResult, queueResult] = await Promise.all([
        getServerCalendar(planDate),
        getServerAgencyMetrics(),
        getServerAgencyQueue(agencyBrandFilter ? { brandId: agencyBrandFilter } : undefined),
      ]);
      setCalendar(calendarResult);
      setAgency(agencyResult);
      setAgencyQueue(queueResult);
      if (selected) {
        const refreshed = await getServerDailyPlan(String(selected.id));
        setSelected(refreshed);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Daily plans could not be loaded.");
    }
  };

  useEffect(() => {
    void load();
  }, [backendEnabled, agencyBrandFilter]);

  const generateWeek = async () => {
    setBusy("calendar");
    setError("");
    try {
      const result = await generateServerCalendar({
        weekStart: planDate,
        channel: "dashboard",
        contentTypes: ["organic_poster", "promotional_ad"],
      });
      setCalendar(result.entries);
      setMessage("Weekly content calendar generated from the approved brand profile.");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "The weekly calendar could not be generated.",
      );
    } finally {
      setBusy("");
    }
  };

  const selectedGates = list(selected?.approvalGates) as AnyRecord[];
  const pendingGateIds = selectedGates
    .filter((gate) => gate.state === "PENDING")
    .map((gate) => String(gate.id));
  const selectedPlans = list(selected?.creativePlans) as AnyRecord[];
  const failures = list(selected?.failures) as AnyRecord[];
  const pendingCount = useMemo(
    () => plans.filter((plan) => plan.status === "PENDING_APPROVAL").length,
    [plans],
  );

  const createPlan = async () => {
    setBusy("create");
    setError("");
    setMessage("");
    try {
      const result = await createServerDailyPlan({
        planDate,
        autonomyMode: mode as "DRAFT" | "APPROVAL" | "GUARDED_AUTOPUBLISH" | "CAMPAIGN",
        channel: "dashboard",
      });
      setSelected(result.plan);
      setMessage(
        result.deduplicated
          ? "This date already has a durable plan; opened the existing run."
          : "Plan created in the workspace.",
      );
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The daily plan could not be created.");
    } finally {
      setBusy("");
    }
  };

  const execute = async () => {
    if (!selected) return;
    setBusy("run");
    setError("");
    try {
      const result = await runServerDailyPlan(String(selected.id));
      setSelected(result.plan);
      setMessage("Production and deterministic QA completed. Review gates are up to date.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The plan could not be produced.");
    } finally {
      setBusy("");
    }
  };

  const approve = async () => {
    if (!selected || pendingGateIds.length === 0) return;
    setBusy("approve");
    setError("");
    try {
      setSelected(await approveServerDailyPlan(String(selected.id), pendingGateIds));
      setMessage("Approval recorded with the reviewer identity and event trace.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The approval could not be recorded.");
    } finally {
      setBusy("");
    }
  };

  const exportPlan = async () => {
    if (!selected) return;
    setBusy("export");
    setError("");
    try {
      const result = await exportServerDailyPlan(String(selected.id));
      setSelected(await getServerDailyPlan(String(result.plan.id)));
      setMessage(
        `Delivery manifest created · ${String(result.manifest.manifestHash).slice(0, 12)}…`,
      );
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "The delivery manifest could not be created.",
      );
    } finally {
      setBusy("");
    }
  };

  const revise = async () => {
    if (!selected || !revision.trim()) return;
    const gate = selectedGates.find((item) => item.state === "PENDING");
    setBusy("revise");
    setError("");
    try {
      setSelected(
        await reviseServerDailyPlan(String(selected.id), {
          gateId: gate ? String(gate.id) : undefined,
          instruction: revision,
          category: /shorten|headline/i.test(revision) ? "copy_layout" : "targeted_revision",
        }),
      );
      setRevision("");
      setMessage(
        "Targeted revision saved. Product/background/source nodes were preserved; run it to render the new version.",
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The revision could not be saved.");
    } finally {
      setBusy("");
    }
  };

  const submitRequest = async () => {
    if (!request.trim()) return;
    setBusy("request");
    setError("");
    try {
      const result = await createServerCreativeRequest({
        rawMessage: request,
        source: "DASHBOARD",
        channel: "dashboard",
      });
      const missing = list(result.request.missingFields).map(String);
      setRequest("");
      setMessage(
        missing.length
          ? `Request paused for: ${missing.join(", ")}.`
          : "Request captured as the canonical creative request.",
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The request could not be captured.");
    } finally {
      setBusy("");
    }
  };

  const updateAgencyItem = async (
    itemId: string,
    input: {
      status?: string;
      deadline?: string;
      revenueMinor?: number;
      providerSpendMinor?: number;
    },
  ) => {
    setBusy("agency:" + itemId);
    setError("");
    try {
      const updated = await updateServerAgencyItem(itemId, input);
      setAgencyQueue((current) =>
        current.map((item) => (String(item.id) === itemId ? { ...item, ...updated } : item)),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Agency work item could not be updated.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Daily Content Desk · durable workflow"
        title="Your daily review queue"
        desc="Calendar, brand truth, product evidence, deterministic composition, QA, approval, delivery and learning in one recoverable run. New workspaces start in Approval mode."
        right={<PhaseTag phase={`${pendingCount} awaiting approval`} />}
      />

      {!backendEnabled && (
        <Panel>
          <div className="p-5 text-sm text-ink-soft">
            Connect the Next.js backend to create durable plans. The visual shell remains available,
            but Autopilot never reports a local demo success.
          </div>
        </Panel>
      )}
      {error && <p className="font-mono text-[11px] text-saffron-deep">{error}</p>}
      {message && <p className="font-mono text-[11px] text-leaf">{message}</p>}

      {backendEnabled && (
        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <Panel
            title="Weekly content calendar"
            right={
              <Btn variant="line" onClick={() => void generateWeek()} disabled={busy !== ""}>
                {busy === "calendar" ? "Planning…" : "Generate week"}
              </Btn>
            }
          >
            <div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
              {calendar.slice(0, 8).map((entry) => (
                <div key={String(entry.id)} className="bg-card p-4">
                  <div className="font-mono text-[10px] text-ink-soft">
                    {String(entry.entryDate).slice(0, 10)}
                  </div>
                  <div className="mt-1 text-sm font-medium">
                    {String(entry.contentType).replace(/_/g, " ")}
                  </div>
                  <div className="mt-1 text-xs text-ink-soft">{String(entry.pillar)}</div>
                </div>
              ))}
              {calendar.length === 0 && (
                <div className="bg-card p-5 text-sm text-ink-soft sm:col-span-2 lg:col-span-4">
                  No weekly entries yet. Generate the calendar after brand setup.
                </div>
              )}
            </div>
          </Panel>
          <Panel title="Agency operating view">
            <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4 lg:grid-cols-2">
              {[
                ["Pending approvals", agency?.pendingApprovals ?? 0],
                ["Blocked", agency?.blocked ?? 0],
                ["Avg turnaround", `${agency?.averageTurnaroundHours ?? 0}h`],
                ["Revisions", agency?.averageRevisionCount ?? 0],
              ].map(([label, value]) => (
                <div key={String(label)} className="bg-card p-4">
                  <div className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">
                    {label}
                  </div>
                  <div className="mt-2 font-display text-2xl">{value}</div>
                </div>
              ))}
            </div>
            <div className="border-t border-line p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">
                  Client / campaign queue
                </span>
                <div className="flex items-center gap-2">
                  <select
                    value={agencyBrandFilter}
                    onChange={(event) => setAgencyBrandFilter(event.target.value)}
                    className="rounded border border-line bg-paper px-2 py-1 font-mono text-[10px]"
                  >
                    <option value="">All client workspaces</option>
                    {[
                      ...new Map(
                        agencyQueue.map((item) => [
                          String(item.brandId ?? item.clientName ?? ""),
                          String(item.clientName ?? "Client"),
                        ]),
                      ),
                    ].map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <span className="font-mono text-[10px] text-ink-soft">
                    {agencyQueue.length} tracked
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                {agencyQueue.slice(0, 6).map((item) => (
                  <div key={String(item.id)} className="rounded-lg border border-line px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm">
                        {String(item.clientName ?? "Client")} · {String(item.title)}
                      </span>
                      <PhaseTag phase={String(item.status).replace(/_/g, " ")} />
                    </div>
                    <div className="mt-1 flex justify-between gap-3 font-mono text-[9px] text-ink-soft">
                      <span>
                        {item.deadline
                          ? `deadline ${String(item.deadline).slice(0, 10)}`
                          : "no deadline"}
                      </span>
                      <span>
                        {item.turnaroundHours == null
                          ? "in progress"
                          : `${String(item.turnaroundHours)}h turnaround`}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-5">
                      <select
                        value={String(item.status ?? "INTERNAL_REVIEW")}
                        disabled={busy === "agency:" + String(item.id)}
                        onChange={(event) =>
                          void updateAgencyItem(String(item.id), { status: event.target.value })
                        }
                        className="rounded border border-line bg-paper px-2 py-1 font-mono text-[10px]"
                      >
                        {[
                          "BLOCKED",
                          "INTERNAL_REVIEW",
                          "CLIENT_REVIEW",
                          "APPROVED_PUBLISH",
                          "DELIVERED",
                        ].map((status) => (
                          <option key={status} value={status}>
                            {status.replace(/_/g, " ")}
                          </option>
                        ))}
                      </select>
                      <input
                        type="date"
                        value={item.deadline ? String(item.deadline).slice(0, 10) : ""}
                        onChange={(event) =>
                          void updateAgencyItem(String(item.id), {
                            deadline: event.target.value
                              ? new Date(event.target.value + "T18:00:00").toISOString()
                              : undefined,
                          })
                        }
                        className="rounded border border-line bg-paper px-2 py-1 font-mono text-[10px]"
                      />
                      <input
                        type="number"
                        min={0}
                        defaultValue={(Number(item.revenueMinor ?? 0) / 100).toFixed(0)}
                        onBlur={(event) =>
                          void updateAgencyItem(String(item.id), {
                            revenueMinor: Math.max(
                              0,
                              Math.round(Number(event.target.value || 0) * 100),
                            ),
                          })
                        }
                        placeholder="Revenue ₹"
                        className="rounded border border-line bg-paper px-2 py-1 font-mono text-[10px]"
                      />
                      <input
                        type="number"
                        min={0}
                        defaultValue={(Number(item.providerSpendMinor ?? 0) / 100).toFixed(0)}
                        onBlur={(event) =>
                          void updateAgencyItem(String(item.id), {
                            providerSpendMinor: Math.max(
                              0,
                              Math.round(Number(event.target.value || 0) * 100),
                            ),
                          })
                        }
                        placeholder="Spend ₹"
                        className="rounded border border-line bg-paper px-2 py-1 font-mono text-[10px]"
                      />
                      <div className="rounded border border-line px-2 py-1 font-mono text-[10px] text-ink-soft">
                        Margin ₹
                        {(
                          Number(item.marginMinor ?? 0) / 100 ||
                          (Number(item.revenueMinor ?? 0) - Number(item.providerSpendMinor ?? 0)) /
                            100
                        ).toFixed(0)}
                      </div>
                    </div>
                  </div>
                ))}
                {agencyQueue.length === 0 && (
                  <p className="font-mono text-[10px] text-ink-soft">
                    Agency work items appear after the first daily plan is created.
                  </p>
                )}
              </div>
            </div>
          </Panel>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Create the daily batch">
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">
                Plan date
              </span>
              <input
                type="date"
                value={planDate}
                onChange={(event) => setPlanDate(event.target.value)}
                className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-saffron-deep"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">
                Autonomy mode
              </span>
              <select
                value={mode}
                onChange={(event) => setMode(event.target.value)}
                className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-saffron-deep"
              >
                <option value="APPROVAL">Approval · default</option>
                <option value="DRAFT">Draft · workspace only</option>
                <option value="CAMPAIGN">Campaign · human approval</option>
                <option value="GUARDED_AUTOPUBLISH">Guarded autopublish · policy required</option>
              </select>
            </label>
            <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
              <Btn onClick={createPlan} disabled={!backendEnabled || busy !== ""}>
                {busy === "create" ? "Creating…" : "Create daily plan"}
              </Btn>
              <span className="font-mono text-[10px] text-ink-soft">
                No new offer, price, regulated claim, or synthetic testimonial can bypass a gate.
              </span>
            </div>
          </div>
        </Panel>

        <Panel title="On-demand request">
          <div className="p-5">
            <textarea
              rows={4}
              value={request}
              onChange={(event) => setRequest(event.target.value)}
              placeholder="Kal Hindi mein sofa post bana do…"
              className="w-full resize-none rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-saffron-deep"
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="font-mono text-[10px] text-ink-soft">
                WhatsApp and chat are request surfaces; this record is the source of truth.
              </span>
              <Btn
                onClick={submitRequest}
                disabled={!backendEnabled || !request.trim() || busy !== ""}
              >
                {busy === "request" ? "Saving…" : "Capture request"}
              </Btn>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <Panel title="Daily inbox">
          <div className="divide-y divide-line">
            {plans.length === 0 && (
              <div className="p-5 text-sm text-ink-soft">No daily plans yet.</div>
            )}
            {plans.map((plan) => (
              <button
                key={String(plan.id)}
                onClick={() => setSelected(plan)}
                className={`block w-full p-5 text-left transition-colors hover:bg-paper-deep ${selected?.id === plan.id ? "bg-paper-deep" : ""}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-display text-lg">{String(plan.planDate).slice(0, 10)}</span>
                  <PhaseTag phase={String(plan.status).replace(/_/g, " ")} />
                </div>
                <div className="mt-2 text-sm text-ink-soft">
                  {list(plan.creativePlans).length} creative plans ·{" "}
                  {
                    list(plan.approvalGates).filter((gate) => record(gate).state === "PENDING")
                      .length
                  }{" "}
                  pending gates
                </div>
              </button>
            ))}
          </div>
        </Panel>

        <Panel
          title={selected ? `Run detail · ${String(selected.planDate).slice(0, 10)}` : "Run detail"}
          right={selected && <PhaseTag phase={String(selected.status).replace(/_/g, " ")} />}
        >
          {!selected ? (
            <div className="p-5 text-sm text-ink-soft">
              Select a daily plan to inspect its agent trace, evidence, gates and repairs.
            </div>
          ) : (
            <div className="space-y-5 p-5">
              <div className="flex flex-wrap gap-3">
                <Btn
                  onClick={execute}
                  disabled={
                    busy !== "" ||
                    [
                      "NEEDS_INPUT",
                      "PENDING_APPROVAL",
                      "APPROVED",
                      "DELIVERED",
                      "PUBLISHED",
                      "PUBLISH_PENDING",
                    ].includes(String(selected.status))
                  }
                >
                  {busy === "run" ? "Producing…" : "Produce + QA"}
                </Btn>
                <Btn
                  variant="ghost"
                  onClick={approve}
                  disabled={busy !== "" || pendingGateIds.length === 0}
                >
                  {busy === "approve" ? "Approving…" : `Approve ${pendingGateIds.length || "all"}`}
                </Btn>
                <Btn
                  variant="line"
                  onClick={exportPlan}
                  disabled={
                    busy !== "" ||
                    !["APPROVED", "PUBLISH_PENDING", "DELIVERED", "PUBLISHED"].includes(
                      String(selected.status),
                    )
                  }
                >
                  {busy === "export" ? "Packaging…" : "Export package"}
                </Btn>
              </div>
              {failures.length > 0 && (
                <div className="rounded-xl border border-saffron-deep/40 bg-saffron-deep/5 p-4">
                  <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-saffron-deep">
                    Repair required
                  </div>
                  {failures.slice(0, 4).map((failure) => (
                    <div key={String(failure.id)} className="mt-2 text-sm text-ink-soft">
                      {String(failure.customerImpact)}
                    </div>
                  ))}
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {selectedPlans.map((creative) => (
                  <div key={String(creative.id)} className="rounded-xl border border-line p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{String(creative.objective)}</div>
                        <div className="mt-1 text-xs text-ink-soft">
                          {String(creative.contentType ?? "creative")} · {String(creative.angle)}
                        </div>
                      </div>
                      <PhaseTag phase={String(creative.status)} />
                    </div>
                    <div className="mt-3 font-mono text-[10px] text-ink-soft">
                      evidence {list(creative.evidenceIds).length} · outputs{" "}
                      {list(record(creative.outputs).assetIds).length}
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-line p-4">
                <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">
                  Targeted revision
                </div>
                <div className="mt-3 flex gap-3">
                  <input
                    value={revision}
                    onChange={(event) => setRevision(event.target.value)}
                    placeholder="Shorten the headline"
                    className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-saffron-deep"
                  />
                  <Btn onClick={revise} disabled={!revision.trim() || busy !== ""}>
                    {busy === "revise" ? "Saving…" : "Revise"}
                  </Btn>
                </div>
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
