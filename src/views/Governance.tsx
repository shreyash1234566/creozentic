import { useEffect, useState } from "react";
import { Btn, PageHeader, Panel, Stat } from "../ui";
import { useStore } from "../store";
import {
  approveServerPolicy,
  createServerCompetitorSource,
  createServerPolicy,
  getServerBenchmarks,
  getServerCompetitorSources,
  getServerCustomModels,
  getServerEnterpriseControls,
  getServerMarketplacePackages,
  getServerPolicies,
  getServerWhiteLabel,
  refreshServerCompetitorSource,
  runServerBenchmark,
  updateServerEnterpriseControls,
  updateServerWhiteLabel,
} from "../client/api";

export default function Governance() {
  const { backendEnabled } = useStore();
  const [policies, setPolicies] = useState<Array<Record<string, unknown>>>([]);
  const [benchmarks, setBenchmarks] = useState<Array<Record<string, unknown>>>([]);
  const [packages, setPackages] = useState<Array<Record<string, unknown>>>([]);
  const [sources, setSources] = useState<Array<Record<string, unknown>>>([]);
  const [models, setModels] = useState<Array<Record<string, unknown>>>([]);
  const [whiteLabel, setWhiteLabel] = useState<Record<string, unknown> | null>(null);
  const [enterprise, setEnterprise] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = async () => {
    if (!backendEnabled) return;
    setError("");
    try {
      const [
        nextPolicies,
        nextBenchmarks,
        nextPackages,
        nextSources,
        nextModels,
        nextWhiteLabel,
        nextEnterprise,
      ] = await Promise.all([
        getServerPolicies(),
        getServerBenchmarks(),
        getServerMarketplacePackages(),
        getServerCompetitorSources(),
        getServerCustomModels(),
        getServerWhiteLabel(),
        getServerEnterpriseControls(),
      ]);
      setPolicies(nextPolicies);
      setBenchmarks(nextBenchmarks);
      setPackages(nextPackages);
      setSources(nextSources);
      setModels(nextModels);
      setWhiteLabel(nextWhiteLabel);
      setEnterprise(nextEnterprise);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Governance data could not be loaded.",
      );
    }
  };

  useEffect(() => {
    void load();
  }, [backendEnabled]);

  const createDefaultPolicy = async (kind: string) => {
    try {
      await createServerPolicy({
        kind,
        content: {
          customerNotice: true,
          owner: "workspace-admin",
          reviewRequired: true,
          effectiveDate: new Date().toISOString(),
        },
      });
      setNotice(`${kind} policy draft created.`);
      await load();
    } catch (policyError) {
      setError(policyError instanceof Error ? policyError.message : "Policy creation failed.");
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Phase 0–5 · Governance & defensibility"
        title="Governance, evaluation & enterprise"
        desc="Benchmarks, rights, policy, safe public-source research, marketplace packages, white-label controls, and custom-model release gates live in the same tenant boundary as creative work."
        right={
          <Btn variant="line" onClick={() => void load()}>
            Refresh controls
          </Btn>
        }
      />
      {error && <p className="font-mono text-[11px] text-saffron-deep">{error}</p>}
      {notice && <p className="font-mono text-[11px] text-leaf">{notice}</p>}
      <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
        <Stat label="Policies" value={String(policies.length)} sub="versioned & auditable" />
        <Stat label="Benchmarks" value={String(benchmarks.length)} sub="release evidence" />
        <Stat label="Packages" value={String(packages.length)} sub="sandboxed workflows" />
        <Stat label="Model projects" value={String(models.length)} sub="rights-gated" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Policies · privacy, rights & AI disclosure">
          <div className="divide-y divide-line">
            {(["PRIVACY", "IP_RIGHTS", "AI_DISCLOSURE", "RETENTION"] as const).map((kind) => {
              const policy =
                policies.find((item) => item.kind === kind && item.status === "APPROVED") ??
                policies.find((item) => item.kind === kind);
              return (
                <div key={kind} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div>
                    <div className="text-sm font-medium">{kind.replace("_", " ")}</div>
                    <div className="font-mono text-[10px] text-ink-soft">
                      {policy
                        ? `v${String(policy.version)} · ${String(policy.status).toLowerCase()}`
                        : "not configured"}
                    </div>
                  </div>
                  {policy?.status === "DRAFT" ? (
                    <Btn
                      variant="line"
                      onClick={() =>
                        void approveServerPolicy(String(policy.id))
                          .then(load)
                          .catch((policyError) =>
                            setError(
                              policyError instanceof Error
                                ? policyError.message
                                : "Approval failed.",
                            ),
                          )
                      }
                    >
                      Approve
                    </Btn>
                  ) : (
                    <Btn variant="ghost" onClick={() => void createDefaultPolicy(kind)}>
                      New version
                    </Btn>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>
        <Panel title="Benchmark release gate">
          <div className="space-y-3 p-5">
            {benchmarks.length === 0 ? (
              <p className="font-mono text-[11px] text-ink-soft">
                No benchmark suite exists yet. Create one through the API before promoting a
                provider or custom model.
              </p>
            ) : (
              benchmarks.map((suite) => (
                <div
                  key={String(suite.id)}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3"
                >
                  <div>
                    <div className="text-sm font-medium">{String(suite.name)}</div>
                    <div className="font-mono text-[10px] text-ink-soft">
                      {String((suite._count as Record<string, unknown> | undefined)?.cases ?? 0)}{" "}
                      cases · {String(suite.status)}
                    </div>
                  </div>
                  <Btn
                    variant="line"
                    onClick={() =>
                      void runServerBenchmark(String(suite.id), "configured-router")
                        .then(() => setNotice("Benchmark completed and stored in the audit trail."))
                        .catch((runError) =>
                          setError(
                            runError instanceof Error ? runError.message : "Benchmark failed.",
                          ),
                        )
                    }
                  >
                    Run suite
                  </Btn>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Permitted competitor intelligence">
          <div className="space-y-3 p-5">
            <div className="flex gap-2">
              <input
                id="competitor-url"
                placeholder="https://customer-authorized-source.example"
                className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-saffron-deep"
              />
              <Btn
                onClick={() => {
                  const input = document.getElementById(
                    "competitor-url",
                  ) as HTMLInputElement | null;
                  if (!input?.value) return;
                  void createServerCompetitorSource({
                    url: input.value,
                    consent: { customerAuthorized: true },
                  })
                    .then(() => {
                      input.value = "";
                      setNotice("Permitted source added.");
                      return load();
                    })
                    .catch((sourceError) =>
                      setError(
                        sourceError instanceof Error
                          ? sourceError.message
                          : "Source creation failed.",
                      ),
                    );
                }}
              >
                Add
              </Btn>
            </div>
            {sources.length === 0 ? (
              <p className="font-mono text-[11px] text-ink-soft">
                No customer-authorized sources. Restricted/private scraping is refused.
              </p>
            ) : (
              sources.map((source) => (
                <div
                  key={String(source.id)}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{String(source.url)}</div>
                    <div className="font-mono text-[10px] text-ink-soft">
                      {String(source.status)} ·{" "}
                      {Array.isArray(source.insights)
                        ? `${source.insights.length} insight(s)`
                        : "no refresh yet"}
                    </div>
                  </div>
                  <Btn
                    variant="line"
                    onClick={() =>
                      void refreshServerCompetitorSource(String(source.id))
                        .then(() => setNotice("Source signal refreshed for human review."))
                        .catch((sourceError) =>
                          setError(
                            sourceError instanceof Error ? sourceError.message : "Refresh failed.",
                          ),
                        )
                    }
                  >
                    Refresh
                  </Btn>
                </div>
              ))
            )}
          </div>
        </Panel>
        <Panel title="White-label & enterprise boundary">
          <div className="space-y-4 p-5">
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                id="portal-name"
                defaultValue={String(whiteLabel?.displayName ?? "Autozentic client portal")}
                className="rounded-lg border border-line bg-paper px-3 py-2 text-sm"
              />
              <input
                id="portal-slug"
                defaultValue={String(whiteLabel?.portalSlug ?? "client-portal")}
                className="rounded-lg border border-line bg-paper px-3 py-2 text-sm"
              />
            </div>
            <Btn
              onClick={() => {
                const name = document.getElementById("portal-name") as HTMLInputElement | null;
                const slug = document.getElementById("portal-slug") as HTMLInputElement | null;
                void updateServerWhiteLabel({
                  displayName: name?.value ?? "Client portal",
                  portalSlug: slug?.value ?? "client-portal",
                  enabled: true,
                  theme: { accent: "#d1560f" },
                })
                  .then(() => setNotice("White-label portal enabled."))
                  .catch((controlError) =>
                    setError(
                      controlError instanceof Error
                        ? controlError.message
                        : "White-label update failed.",
                    ),
                  );
              }}
            >
              Save branded portal
            </Btn>
            <div className="border-t border-line pt-4 font-mono text-[10px] text-ink-soft">
              {enterprise
                ? `Region ${String(enterprise.dataRegion)} · retention ${String(enterprise.retentionDays)} days · SSO ${enterprise.ssoRequired ? "required" : "optional"}`
                : "Enterprise controls not configured"}
            </div>
            <Btn
              variant="line"
              onClick={() =>
                void updateServerEnterpriseControls({
                  dataRegion: "IN",
                  retentionDays: 90,
                  auditExport: true,
                  ssoRequired: false,
                })
                  .then(() => setNotice("Enterprise controls saved."))
                  .catch((controlError) =>
                    setError(
                      controlError instanceof Error
                        ? controlError.message
                        : "Enterprise update failed.",
                    ),
                  )
              }
            >
              Save baseline controls
            </Btn>
          </div>
        </Panel>
      </div>
      <Panel title="Marketplace packages & custom model release policy">
        <div className="divide-y divide-line">
          {packages.length === 0 && models.length === 0 ? (
            <p className="p-5 font-mono text-[11px] text-ink-soft">
              No packages or model projects are installed in this workspace.
            </p>
          ) : (
            <>
              {packages.map((pkg) => (
                <div
                  key={String(pkg.id)}
                  className="flex items-center justify-between gap-3 px-5 py-3"
                >
                  <div>
                    <div className="text-sm font-medium">{String(pkg.name)}</div>
                    <div className="font-mono text-[10px] text-ink-soft">
                      {String(pkg.visibility)} · {String(pkg.status)}
                    </div>
                  </div>
                  <span className="font-mono text-[10px] text-leaf">sandboxed</span>
                </div>
              ))}
              {models.map((model) => (
                <div
                  key={String(model.id)}
                  className="flex items-center justify-between gap-3 px-5 py-3"
                >
                  <div>
                    <div className="text-sm font-medium">{String(model.name)}</div>
                    <div className="font-mono text-[10px] text-ink-soft">
                      {String(model.provider)} · {String(model.status)}
                    </div>
                  </div>
                  <span className="font-mono text-[10px] text-saffron-deep">
                    rights + benchmark required
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      </Panel>
      <p className="font-mono text-[10px] text-ink-soft">
        {backendEnabled
          ? "Connected to tenant-scoped governance APIs."
          : "Enable backend mode to persist governance controls."}{" "}
        All mutations are auditable.
      </p>
    </div>
  );
}
