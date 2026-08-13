import { useEffect, useState } from "react";
import { PageHeader, Panel, Btn } from "../ui";
import { useStore } from "../store";
import { STYLES } from "../data";
import { FORMAT_REGISTRY, quoteProductLock, type QualityMode, uid } from "../domain";
import ScoreCard, { DIMENSIONS, type ScoreRow, hasCritical } from "./ScoreCard";
import { getServerAssetDownload, getServerAssets, getServerProducts } from "../client/api";

type Stage = "brief" | "quote" | "running" | "result";

const PIPELINE = [
  "Validate & normalise original",
  "Segment / mask product · record geometry",
  "Generate environment",
  "Composite · match perspective, light, shadow",
  "OCR + image-difference integrity check",
];

export default function ProductLock() {
  const {
    brand,
    workflowRuns,
    reviewTasks,
    backendEnabled,
    startServerWorkflow,
    refreshServerState,
  } = useStore();
  const [stage, setStage] = useState<Stage>("brief");
  const [mode, setMode] = useState<"lock" | "creative">("lock");
  const [qualityMode, setQualityMode] = useState<QualityMode>("balanced");
  const [product, setProduct] = useState("Kadam 3-seater sofa");
  const [sku, setSku] = useState("KOS-SOF-114");
  const [scene, setScene] = useState(STYLES[0]);
  const [count, setCount] = useState(4);
  const [formats, setFormats] = useState<string[]>(["1:1", "4:5", "9:16"]);
  const [step, setStep] = useState(0);
  const [runId, setRunId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);

  const quote = quoteProductLock({
    count,
    qualityMode,
    productLock: mode === "lock",
    outputFormats: formats,
  });
  const currentRun = runId ? workflowRuns.find((run) => run.id === runId) : undefined;
  const currentReview = currentRun?.reviewTaskId
    ? reviewTasks.find((review) => review.id === currentRun.reviewTaskId)
    : undefined;

  useEffect(() => {
    if (!backendEnabled || !runId) return;
    const timer = window.setInterval(() => {
      void refreshServerState().catch((reason) =>
        setError(
          reason instanceof Error ? reason.message : "The server status could not be refreshed.",
        ),
      );
    }, 2500);
    return () => window.clearInterval(timer);
  }, [backendEnabled, refreshServerState, runId]);

  useEffect(() => {
    if (!backendEnabled) return;
    void Promise.all([getServerAssets(), getServerProducts()])
      .then(async ([assets, products]) => {
        const selectedProduct = products[0];
        if (selectedProduct) {
          setProduct(String(selectedProduct.title));
          setSku(String(selectedProduct.sku));
        } else {
          setProduct("");
          setSku("");
          setError("Import a verified product record before starting a Product-Lock run.");
        }
        const source = assets.find(
          (asset) =>
            ["IMMUTABLE", "READY", "DERIVED"].includes(String(asset.status)) &&
            String(asset.mimeType ?? "").startsWith("image/"),
        );
        if (source) setSourceUrl((await getServerAssetDownload(String(source.id))).url);
      })
      .catch((reason) =>
        setError(
          reason instanceof Error ? reason.message : "The source asset could not be loaded.",
        ),
      );
  }, [backendEnabled]);

  useEffect(() => {
    if (!backendEnabled || !currentRun) return;
    if (currentRun.state === "awaiting_review") {
      setStep(PIPELINE.length);
      setStage("result");
    }
    if (currentRun.state === "terminal_failure" || currentRun.state === "cancelled") {
      setError(currentRun.error ?? `Run ${currentRun.state}.`);
    }
  }, [backendEnabled, currentRun]);

  const rows: ScoreRow[] = DIMENSIONS.map((d) => {
    const verdict = currentReview?.verdicts?.[d.dim];
    return {
      ...d,
      verdict: verdict?.verdict ?? "warn",
      repair: verdict?.repair ?? "The server quality gate has not returned a verdict yet.",
    };
  });
  const blocked = hasCritical(rows);

  const run = () => {
    setError("");
    const brief = {
      product,
      sku,
      scene,
      count,
      mode,
      qualityMode,
      outputFormats: formats,
      audience: brand.audience,
      language: brand.language,
      cta: "Shop the collection",
    };
    if (backendEnabled) {
      void startServerWorkflow({
        title: `${product} · ${scene} · ${count} variants`,
        brief,
        idempotencyKey: uid("brief"),
      }).then((result) => {
        if (result.error || !result.runId) {
          setError(result.error ?? "The server could not start this run.");
          return;
        }
        setRunId(result.runId);
        setStage("running");
      });
      return;
    }
    setError(
      "Product-Lock Studio requires the backend workflow service; no local result is presented as production output.",
    );
    return;
  };

  const reset = () => {
    setStage("brief");
    setStep(0);
    setRunId(null);
    setError("");
  };

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="P0 · Business / D2C beachhead"
        title="Product-Lock Studio"
        desc="Upload a catalogue product; create controlled scene variants while the real product, its text, and its colours stay intact. Cost is shown before any work starts, and a critical integrity failure blocks publishing."
        right={
          stage !== "brief" && (
            <Btn variant="line" onClick={reset}>
              New brief
            </Btn>
          )
        }
      />

      {error && (
        <div className="rounded-xl border border-saffron-deep bg-saffron-deep/8 px-4 py-3 font-mono text-[11px] text-saffron-deep">
          {error}
        </div>
      )}

      {/* stepper */}
      <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em]">
        {(["brief", "quote", "running", "result"] as Stage[]).map((s, i) => {
          const order = ["brief", "quote", "running", "result"];
          const active = order.indexOf(stage) >= i;
          return (
            <div key={s} className="flex items-center gap-2">
              <span className={active ? "text-saffron-deep" : "text-ink-soft"}>
                {i + 1}. {s === "running" ? "generate" : s}
              </span>
              {i < 3 && <span className="text-line">—</span>}
            </div>
          );
        })}
      </div>

      {stage === "brief" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <Panel title="Guided brief · no prompt required">
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Product name">
                <input
                  value={product}
                  onChange={(e) => setProduct(e.target.value)}
                  className={inp}
                />
              </Field>
              <Field label="SKU">
                <input value={sku} onChange={(e) => setSku(e.target.value)} className={inp} />
              </Field>
              <Field label="Scene style">
                <select value={scene} onChange={(e) => setScene(e.target.value)} className={inp}>
                  {STYLES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field label="Variants">
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={count}
                  onChange={(e) => setCount(Math.max(1, Math.min(12, +e.target.value)))}
                  className={inp}
                />
              </Field>
              <div className="sm:col-span-2">
                <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">
                  Generation mode
                </span>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(["lock", "creative"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={`rounded-xl border p-4 text-left transition-colors ${
                        mode === m
                          ? "border-saffron-deep bg-paper-deep"
                          : "border-line hover:border-ink"
                      }`}
                    >
                      <div className="text-sm font-medium">
                        {m === "lock" ? "Product-lock" : "Creative scene"}
                      </div>
                      <div className="mt-1 text-[12px] leading-relaxed text-ink-soft">
                        {m === "lock"
                          ? "Real product preserved exactly. Safe for marketplace hero images."
                          : "Shape/material may be stylised. Never for regulated claims without review."}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <Field label="Quality / cost mode">
                <select
                  value={qualityMode}
                  onChange={(e) => setQualityMode(e.target.value as QualityMode)}
                  className={inp}
                >
                  <option value="fast">Fast · lower cost</option>
                  <option value="balanced">Balanced · recommended</option>
                  <option value="quality">Quality · higher cost</option>
                </select>
              </Field>
              <div>
                <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">
                  Output formats
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {FORMAT_REGISTRY.slice(0, 3).map((format) => {
                    const active = formats.includes(format.ratio);
                    return (
                      <button
                        key={format.id}
                        type="button"
                        onClick={() =>
                          setFormats((current) =>
                            active
                              ? current.filter((item) => item !== format.ratio)
                              : [...current, format.ratio],
                          )
                        }
                        className={`rounded-full border px-2.5 py-1 font-mono text-[10px] ${
                          active
                            ? "border-saffron-deep bg-saffron-deep text-paper"
                            : "border-line text-ink-soft"
                        }`}
                      >
                        {format.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="Source product">
            <div className="p-5">
              {sourceUrl ? (
                <img
                  src={sourceUrl}
                  alt="source product"
                  className="aspect-[4/3] w-full rounded-lg object-cover"
                />
              ) : (
                <div className="flex aspect-[4/3] items-center justify-center rounded-lg border border-dashed border-line bg-paper-deep p-4 text-center font-mono text-[11px] text-ink-soft">
                  Upload and verify a source product asset to preview it here.
                </div>
              )}
              <div className="mt-3 font-mono text-[11px] text-ink-soft">
                Original is immutable · {brand.name} memory applied · {brand.language} captions
              </div>
              <Btn className="mt-4 w-full" onClick={() => setStage("quote")}>
                Get quote →
              </Btn>
            </div>
          </Panel>
        </div>
      )}

      {stage === "quote" && (
        <Panel title="Cost quote · shown before any work starts">
          <div className="grid gap-px bg-line sm:grid-cols-3">
            {[
              ["Est. credits", String(quote.credits), "reserved, not charged yet"],
              [
                "Provider raw cost",
                `₹${(quote.providerCostMinor / 100).toFixed(2)}`,
                "internal · routed capability",
              ],
              ["Est. time", `~${quote.etaSec}s`, "subject to provider queue"],
            ].map(([l, v, s]) => (
              <div key={l} className="bg-card px-5 py-5">
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
                  {l}
                </div>
                <div className="mt-1 font-display text-2xl font-medium text-saffron-deep">{v}</div>
                <div className="mt-1 font-mono text-[10px] text-ink-soft">{s}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4">
            <div className="max-w-lg font-mono text-[11px] leading-relaxed text-ink-soft">
              Rules that will apply: product-truth invariant ({mode} mode), {brand.name} locked
              tokens, claims lint, {scene.toLowerCase()} scene, and safe-area preflight for
              feed/story/landscape.
            </div>
            <div className="flex gap-2">
              <Btn variant="line" onClick={() => setStage("brief")}>
                Back
              </Btn>
              <Btn onClick={run}>Reserve & generate</Btn>
            </div>
            {quote.warnings.length > 0 && (
              <div className="border-t border-line px-5 py-3 font-mono text-[11px] text-marigold">
                Routing note: {quote.warnings.join(" ")}
              </div>
            )}
          </div>
        </Panel>
      )}

      {stage === "running" && (
        <Panel title="Product-preserving pipeline">
          <ol className="p-5">
            {PIPELINE.map((p, i) => {
              const done = i < step;
              const on = i === step;
              return (
                <li key={p} className="flex items-center gap-3 py-2.5">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full border font-mono text-[11px] ${
                      done
                        ? "border-leaf bg-leaf text-paper"
                        : on
                          ? "border-saffron-deep text-saffron-deep"
                          : "border-line text-ink-soft"
                    }`}
                  >
                    {done ? "✓" : on ? "•" : i + 1}
                  </span>
                  <span
                    className={`text-sm ${
                      done ? "text-ink-soft" : on ? "font-medium" : "text-ink-soft/60"
                    }`}
                  >
                    {p}
                  </span>
                  {on && (
                    <span className="ml-auto h-4 w-4 animate-spin rounded-full border-2 border-line border-t-saffron-deep" />
                  )}
                </li>
              );
            })}
          </ol>
        </Panel>
      )}

      {stage === "result" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            <Panel
              title={`Variants · ${product}`}
              right={<span className="font-mono text-[11px] text-ink-soft">{mode} mode</span>}
            >
              <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">
                {currentRun?.outputs?.length ? (
                  currentRun.outputs.map((output) =>
                    output.downloadUrl ? (
                      <img
                        key={output.id}
                        src={output.downloadUrl}
                        alt={output.name}
                        className="aspect-[4/5] rounded-lg object-cover"
                      />
                    ) : (
                      <div
                        key={output.id}
                        className="flex aspect-[4/5] items-center justify-center rounded-lg border border-dashed border-line bg-paper-deep p-3 text-center font-mono text-[10px] text-ink-soft"
                      >
                        {output.name}
                        <br />
                        Signed preview unavailable
                      </div>
                    ),
                  )
                ) : (
                  <div className="col-span-full rounded-lg border border-dashed border-line p-6 text-center font-mono text-[11px] text-ink-soft">
                    No server outputs are available yet.
                  </div>
                )}
              </div>
            </Panel>
            <div
              className={`rounded-2xl border px-5 py-4 ${
                blocked ? "border-saffron-deep bg-saffron-deep/8" : "border-leaf bg-leaf/8"
              }`}
            >
              <div className="text-sm font-medium">
                {blocked
                  ? "Integrity gate: publishing blocked until the critical failure is repaired."
                  : "Integrity gate passed. Sent to the review inbox for human approval."}
              </div>
              <div className="mt-1 font-mono text-[11px] text-ink-soft">
                Source-of-truth order: locked facts → brief → template → model proposal → human
                decision.
              </div>
              <div className="mt-3 font-mono text-[11px] text-ink-soft">
                Run {currentRun?.id.slice(-8)} · {currentRun?.state} ·{" "}
                {currentRun?.outputs.length ?? 0} manifest entries · brand v
                {currentRun?.brandVersion}
              </div>
            </div>
          </div>
          <Panel title="Quality & integrity gate">
            <div className="p-5">
              <ScoreCard rows={rows} kind="static" />
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}

const inp =
  "w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-saffron-deep";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">
        {label}
      </span>
      {children}
    </label>
  );
}
