import { useEffect, useMemo, useState } from "react";
import { Btn, PageHeader, Panel } from "../ui";
import {
  createServerDeliveryRule,
  createServerRevisionRequest,
  getServerCampaign,
  getServerCampaigns,
  selectServerCampaignDirection,
  updateServerCampaignFacts,
} from "../client/api";
import CreativePassport from "./CreativePassport";

type AnyRecord = Record<string, unknown>;
function rec(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as AnyRecord) : {};
}
function list(value: unknown) {
  return Array.isArray(value) ? value : [];
}
function statusText(value: unknown) {
  return String(value ?? "NEEDS_INPUT")
    .toLowerCase()
    .replace(/_/g, " ");
}

export default function Campaigns({ go }: { go: (view: string) => void }) {
  const backendEnabled = process.env.NEXT_PUBLIC_BACKEND_ENABLED === "true";
  const [campaigns, setCampaigns] = useState<AnyRecord[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selected, setSelected] = useState<AnyRecord | null>(null);
  const [error, setError] = useState("");
  const [revisionScope, setRevisionScope] = useState("COPY_ONLY");
  const [revisionIntent, setRevisionIntent] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!backendEnabled) return;
    try {
      const rows = (await getServerCampaigns()) as AnyRecord[];
      setCampaigns(rows);
      const id = selectedId || String(rows[0]?.id ?? "");
      if (id) {
        setSelectedId(id);
        setSelected((await getServerCampaign(id)) as AnyRecord);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Campaigns could not be loaded.");
    }
  };

  useEffect(() => {
    void load();
  }, [backendEnabled]);

  const buckets = useMemo(
    () => ({
      needsInput: campaigns.filter((item) =>
        ["NEEDS_INPUT", "BLOCKED"].includes(String(item.lifecycleStatus)),
      ).length,
      review: campaigns.filter((item) =>
        ["READY_FOR_REVIEW", "NEEDS_REVIEW"].includes(String(item.lifecycleStatus)),
      ).length,
      scheduled: campaigns.filter((item) => String(item.lifecycleStatus) === "SCHEDULED").length,
      learning: campaigns.filter((item) =>
        ["PUBLISHED", "LEARNING"].includes(String(item.lifecycleStatus)),
      ).length,
    }),
    [campaigns],
  );

  const select = async (id: string) => {
    setSelectedId(id);
    setError("");
    try {
      setSelected((await getServerCampaign(id)) as AnyRecord);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Campaign details could not be loaded.");
    }
  };

  const confirmFacts = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const facts = list(selected.facts)
        .map((fact) => {
          const item = rec(fact);
          const state = String(item.state ?? "NEEDS_CONFIRMATION");
          return {
            field: String(item.field ?? ""),
            value: item.value,
            source: String(item.source ?? "workspace confirmation"),
            state: state === "NEEDS_CONFIRMATION" ? "CONFIRMED" : state,
            expiresAt: item.expiresAt ? String(item.expiresAt) : undefined,
          };
        })
        .filter((item) => item.field);
      await updateServerCampaignFacts(String(selected.id), facts);
      await select(String(selected.id));
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The fact sheet could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const requestRevision = async () => {
    if (!selected || !revisionIntent.trim()) return;
    setBusy(true);
    setError("");
    try {
      await createServerRevisionRequest(String(selected.id), {
        scope: revisionScope,
        intent: revisionIntent,
        affectedFields:
          revisionScope === "COPY_ONLY" ? ["headline", "caption", "cta"] : ["selected scope"],
        parentVersion: `campaign-v${String(selected.version ?? "1")}`,
      });
      setRevisionIntent("");
      await select(String(selected.id));
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "The revision request could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  };

  const selectDirection = async (directionId: string) => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await selectServerCampaignDirection(String(selected.id), directionId);
      await select(String(selected.id));
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The direction could not be selected.");
    } finally {
      setBusy(false);
    }
  };

  const createRule = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await createServerDeliveryRule(String(selected.id), {
        what: "Prepare the next approved daily pack for review",
        source: { type: "campaign", campaignId: selected.id },
        maxCostMinor: 12000,
        approvalMode: "APPROVAL",
        schedule: { cadence: "daily", channel: "approval-inbox" },
        fallback: "Pause and ask for missing facts or approval",
      });
      await select(String(selected.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The delivery rule could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  if (!backendEnabled) {
    return (
      <div className="space-y-8">
        <PageHeader
          kicker="Campaigns · server workspace"
          title="Campaign packs"
          desc="Connect the backend to see campaigns, facts, evidence, approvals, delivery, and cost in one source of truth."
          right={<Btn onClick={() => go("create")}>Create campaign</Btn>}
        />
        <Panel title="No local campaign samples">
          <div className="p-6 text-sm text-ink-soft">
            Demo mode intentionally does not invent campaign state. Use Create campaign to start
            when the production workspace is connected.
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="P0 · Campaign Pack"
        title="Campaigns"
        desc="Every campaign keeps its brief, Truth Lock facts, output pack, review decisions, delivery receipts, and cost together."
        right={<Btn onClick={() => go("create")}>Create campaign</Btn>}
      />
      {error && (
        <div className="rounded-xl border border-saffron-deep bg-saffron-deep/8 px-4 py-3 font-mono text-[11px] text-saffron-deep">
          {error}
        </div>
      )}

      <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
        {[
          ["Needs input", buckets.needsInput],
          ["Ready for review", buckets.review],
          ["Scheduled", buckets.scheduled],
          ["Published / learning", buckets.learning],
        ].map(([label, value]) => (
          <div key={String(label)} className="bg-card px-5 py-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">
              {label}
            </div>
            <div className="mt-1 font-display text-2xl">{String(value)}</div>
          </div>
        ))}
      </div>

      {campaigns.length === 0 ? (
        <Panel title="Create your first campaign pack">
          <div className="p-6 text-sm text-ink-soft">
            Start with an outcome, confirm the commercial facts, choose a safe route, and receive a
            reviewable pack.
          </div>
        </Panel>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <Panel title="All campaigns">
            <div>
              {campaigns.map((campaign) => (
                <button
                  key={String(campaign.id)}
                  onClick={() => void select(String(campaign.id))}
                  className={`w-full border-b border-line px-4 py-3 text-left last:border-0 ${String(campaign.id) === selectedId ? "bg-paper-deep" : "hover:bg-paper-deep/50"}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-medium">{String(campaign.name)}</span>
                    <span className="h-2 w-2 shrink-0 rounded-full bg-saffron-deep" />
                  </div>
                  <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-soft">
                    {statusText(campaign.lifecycleStatus)}
                  </div>
                </button>
              ))}
            </div>
          </Panel>

          {selected && (
            <CampaignDetail
              campaign={selected}
              busy={busy}
              onConfirmFacts={confirmFacts}
              revisionScope={revisionScope}
              setRevisionScope={setRevisionScope}
              revisionIntent={revisionIntent}
              setRevisionIntent={setRevisionIntent}
              onRevision={requestRevision}
              onSelectDirection={selectDirection}
              onCreateRule={createRule}
              go={go}
            />
          )}
        </div>
      )}
    </div>
  );
}

function CampaignDetail({
  campaign,
  busy,
  onConfirmFacts,
  revisionScope,
  setRevisionScope,
  revisionIntent,
  setRevisionIntent,
  onRevision,
  onSelectDirection,
  onCreateRule,
  go,
}: {
  campaign: AnyRecord;
  busy: boolean;
  onConfirmFacts: () => void;
  revisionScope: string;
  setRevisionScope: (value: string) => void;
  revisionIntent: string;
  setRevisionIntent: (value: string) => void;
  onRevision: () => void;
  onSelectDirection: (directionId: string) => void;
  onCreateRule: () => void;
  go: (view: string) => void;
}) {
  const brief = rec(campaign.brief);
  const facts = list(campaign.facts);
  const outputs = list(campaign.outputs);
  const reviews = list(campaign.reviews);
  const revisions = list(campaign.revisions);
  const directions = list(campaign.directions);
  const events = list(campaign.events);
  const deliveryRules = list(campaign.deliveryRules);
  const ugcProjects = list(campaign.ugcProjects);
  const runs = list(campaign.runs);
  const estimatedCredits = runs.reduce(
    (total, run) =>
      total + Number(rec(rec(run).quoteSnapshot).credits ?? rec(run).reservedUnits ?? 0),
    0,
  );
  const providerCostMinor = runs.reduce(
    (total, run) => total + Number(rec(rec(run).quoteSnapshot).providerCostMinor ?? 0),
    0,
  );
  return (
    <div className="space-y-6">
      <Panel
        title={String(campaign.name)}
        right={
          <span className="font-mono text-[10px] uppercase text-ink-soft">
            {statusText(campaign.lifecycleStatus)}
          </span>
        }
      >
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          <div>
            <div className="label">Objective</div>
            <div className="mt-1 text-sm">{String(campaign.objective)}</div>
          </div>
          <div>
            <div className="label">Channels</div>
            <div className="mt-1 text-sm">
              {list(brief.channels).map(String).join(" · ") || "Not selected"}
            </div>
          </div>
          <div>
            <div className="label">Pack status</div>
            <div className="mt-1 text-sm">
              {outputs.length} outputs · {reviews.length} reviews
            </div>
          </div>
        </div>
      </Panel>

      <Panel
        title="Truth Lock · fact sheet"
        right={
          <Btn variant="line" onClick={onConfirmFacts} disabled={busy || facts.length === 0}>
            {busy ? "Saving…" : "Confirm editable facts"}
          </Btn>
        }
      >
        <div className="divide-y divide-line">
          {facts.length === 0 ? (
            <div className="p-5 text-sm text-ink-soft">
              No structured facts yet. Create the campaign from the guided Create flow.
            </div>
          ) : (
            facts.map((fact) => {
              const item = rec(fact);
              const state = String(item.state ?? "NEEDS_CONFIRMATION");
              return (
                <div key={String(item.id)} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 font-mono text-[9px] uppercase ${state === "LOCKED" || state === "CONFIRMED" ? "bg-leaf/15 text-leaf" : "bg-marigold/20 text-ink"}`}
                  >
                    {state.replace(/_/g, " ")}
                  </span>
                  <span className="w-32 text-sm font-medium">{String(item.field)}</span>
                  <span className="flex-1 text-sm text-ink-soft">
                    {typeof item.value === "string" ? item.value : JSON.stringify(item.value)}
                  </span>
                  <span className="font-mono text-[10px] text-ink-soft">
                    {String(item.source ?? "workspace")}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </Panel>

      <CreativePassport passport={rec(campaign.passport)} />

      <Panel title="Campaign Pack · one reviewable delivery unit">
        {outputs.length === 0 ? (
          <div className="p-5 text-sm text-ink-soft">
            The pack will show visual formats, copy, QA evidence, review state, delivery receipts
            and cost as soon as production attaches output versions.
          </div>
        ) : (
          <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {outputs.slice(0, 12).map((output) => {
              const item = rec(output);
              const metadata = rec(item.metadata);
              const quality = rec(item.qualityScores);
              return (
                <div key={String(item.id)} className="rounded-xl border border-line p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{String(item.name)}</span>
                    <span className="font-mono text-[9px] uppercase text-saffron-deep">
                      {String(item.status)}
                    </span>
                  </div>
                  <div className="mt-2 grid gap-1 font-mono text-[10px] text-ink-soft">
                    <span>
                      Format: {String(item.format ?? "—")} · Locale:{" "}
                      {String(item.locale ?? "master")}
                    </span>
                    <span>
                      Template:{" "}
                      {String(metadata.templateVersion ?? metadata.templateId ?? "recorded in run")}
                    </span>
                    <span>
                      Output QA:{" "}
                      {Object.keys(quality).length
                        ? Object.keys(quality).length + " checks"
                        : "pending"}
                    </span>
                    <span>Review: {String(item.status ?? "draft").toLowerCase()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="border-t border-line px-5 py-3 font-mono text-[10px] text-ink-soft">
          Facts, brand version, route/template, output QA, human decision and delivery receipts stay
          attached to this campaign pack.
        </div>
      </Panel>

      <Panel title="Creative directions · choose before spend">
        <div className="grid gap-3 p-5 md:grid-cols-3">
          {directions.length === 0 ? (
            <p className="text-sm text-ink-soft">
              Directions will be created from the guided Create flow.
            </p>
          ) : (
            directions.map((direction) => {
              const item = rec(direction);
              const copy = rec(item.copy);
              const selected = String(item.status) === "SELECTED";
              return (
                <button
                  key={String(item.id)}
                  onClick={() => onSelectDirection(String(item.id))}
                  className={`rounded-xl border p-4 text-left ${selected ? "border-saffron-deep bg-paper-deep" : "border-line hover:border-ink"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{String(item.name)}</span>
                    <span className="font-mono text-[9px] uppercase text-saffron-deep">
                      {selected ? "selected" : "choose"}
                    </span>
                  </div>
                  <p className="mt-2 text-[12px] text-ink-soft">{String(item.promise)}</p>
                  <p className="mt-3 font-display text-base">{String(copy.headline ?? "")}</p>
                  <p className="mt-1 font-mono text-[10px] text-ink-soft">{String(item.visual)}</p>
                </button>
              );
            })
          )}
        </div>
      </Panel>

      <Panel title="Proof-first UGC deliverables">
        <div className="divide-y divide-line">
          {ugcProjects.length === 0 ? (
            <p className="p-5 text-sm text-ink-soft">
              No UGC project is linked to this campaign yet.
            </p>
          ) : (
            ugcProjects.map((project) => {
              const item = rec(project);
              const brief = rec(item.brief);
              return (
                <div
                  key={String(item.id)}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                >
                  <div>
                    <div className="text-sm font-medium">{String(item.name)}</div>
                    <div className="font-mono text-[10px] text-ink-soft">
                      {String(item.status)} · source {list(brief.sourceAssetIds).length} verified
                      asset(s) · disclosure{" "}
                      {brief.consentSubject ? "consent-gated" : "real-footage route"}
                    </div>
                  </div>
                  <Btn variant="line" onClick={() => go("video")}>
                    Open UGC Studio
                  </Btn>
                </div>
              );
            })
          )}
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Pack, delivery & cost">
          <div className="space-y-2 p-5">
            <div className="text-sm text-ink-soft">
              {outputs.length
                ? `${outputs.length} output versions are attached.`
                : "No output versions yet."}
            </div>
            <div className="text-sm text-ink-soft">
              {list(campaign.publishJobs).length
                ? `${list(campaign.publishJobs).length} delivery jobs recorded.`
                : "No delivery receipt yet."}
            </div>
            <div className="rounded-lg border border-line bg-paper-deep px-3 py-2">
              <div className="font-mono text-[10px] uppercase text-ink-soft">Cost receipt</div>
              <div className="mt-1 text-sm">
                {estimatedCredits || providerCostMinor
                  ? `${estimatedCredits} credits · ₹${(providerCostMinor / 100).toFixed(2)} route estimate`
                  : "No paid run has been reserved"}
              </div>
              <div className="mt-1 font-mono text-[10px] text-ink-soft">
                Maximum is shown before production; approved output keeps the exact run receipt.
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Btn onClick={() => go("review")} disabled={!reviews.length}>
                Open Review Room
              </Btn>
              <Btn variant="line" onClick={() => go("productlock")}>
                Continue production
              </Btn>
            </div>
          </div>
        </Panel>
        <Panel title="Revision intelligence">
          <div className="space-y-3 p-5">
            <div className="grid gap-2 sm:grid-cols-2">
              <select
                value={revisionScope}
                onChange={(event) => setRevisionScope(event.target.value)}
                className="rounded-lg border border-line bg-paper px-3 py-2 text-sm"
              >
                <option value="COPY_ONLY">Copy only</option>
                <option value="LAYOUT_ONLY">Layout only</option>
                <option value="FORMAT_ONLY">Format only</option>
                <option value="VISUAL_ONLY">Visual only</option>
                <option value="COMPLETE_RECONCEPT">Complete re-concept</option>
                <option value="FACT_CHANGE">Fact change</option>
              </select>
              <input
                value={revisionIntent}
                onChange={(event) => setRevisionIntent(event.target.value)}
                placeholder="What should change?"
                className="rounded-lg border border-line bg-paper px-3 py-2 text-sm"
              />
            </div>
            <Btn onClick={onRevision} disabled={busy || !revisionIntent.trim()}>
              Save scoped revision
            </Btn>
            {revisions.slice(0, 4).map((revision) => {
              const item = rec(revision);
              return (
                <div
                  key={String(item.id)}
                  className="rounded-lg border border-line px-3 py-2 text-sm"
                >
                  <span className="font-mono text-[10px] uppercase text-saffron-deep">
                    {statusText(item.scope)}
                  </span>
                  <p className="mt-1 text-ink-soft">{String(item.intent)}</p>
                  <p className="mt-1 font-mono text-[10px] text-ink-soft">
                    Preserves locked facts · {statusText(item.status)}
                  </p>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Safe Autopilot contract">
          <div className="space-y-3 p-5">
            {deliveryRules.length === 0 ? (
              <p className="text-sm text-ink-soft">No recurring delivery rule is attached yet.</p>
            ) : (
              deliveryRules.map((rule) => {
                const item = rec(rule);
                return (
                  <div key={String(item.id)} className="rounded-lg border border-line px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium">{String(item.what)}</span>
                      <span className="font-mono text-[9px] uppercase text-saffron-deep">
                        {item.paused ? "paused" : String(item.approvalMode ?? "approval")}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-[10px] text-ink-soft">
                      cap ₹{(Number(item.maxCostMinor ?? 0) / 100).toFixed(0)} · fallback{" "}
                      {String(item.fallback ?? "pause")}
                    </p>
                  </div>
                );
              })
            )}
            <Btn variant="line" onClick={onCreateRule} disabled={busy}>
              {deliveryRules.length ? "Add another delivery rule" : "Add approval rule"}
            </Btn>
          </div>
        </Panel>
        <Panel title="Campaign activity">
          <div className="max-h-64 divide-y divide-line overflow-y-auto">
            {events.length === 0 ? (
              <p className="p-5 text-sm text-ink-soft">No campaign events recorded yet.</p>
            ) : (
              events.slice(0, 12).map((event) => {
                const item = rec(event);
                return (
                  <div key={String(item.id)} className="px-5 py-3">
                    <div className="text-sm font-medium">{String(item.message)}</div>
                    <div className="mt-1 font-mono text-[10px] uppercase text-ink-soft">
                      {String(item.kind)} ·{" "}
                      {item.createdAt
                        ? new Date(String(item.createdAt)).toLocaleString("en-IN")
                        : "—"}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">
      {children}
    </div>
  );
}
