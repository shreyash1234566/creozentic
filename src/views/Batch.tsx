import { useEffect, useState } from "react";
import { PageHeader, Panel, Btn } from "../ui";
import { SAMPLE_IMAGES, STYLES, img } from "../data";
import { useStore } from "../store";
import type { OutputAsset } from "../domain";
import { createServerBatch, getServerBatch, retryServerBatchRow } from "../client/api";
import { uid } from "../domain";

const SEED = `Kadam 3-seater sofa, teak
Meera bookshelf, walnut
Surya dining table, oak
Rani armchair, emerald velvet
Ganga bed frame, rosewood
Aravalli coffee table, marble`;

const FORMATS = [
  { id: "feed", label: "Feed", ratio: "1:1", box: "aspect-square" },
  { id: "story", label: "Story", ratio: "9:16", box: "aspect-[9/16]" },
  { id: "land", label: "Landscape", ratio: "1.91:1", box: "aspect-[1.91/1]" },
];

type Row = {
  id?: string;
  name: string;
  style: string;
  image: string;
  status: string;
  error?: string;
};

export default function Batch() {
  const {
    brand,
    credits,
    reservedCredits,
    createWorkflowRun,
    transitionWorkflowRun,
    updateWorkflowRun,
    completeWorkflowRun,
    backendEnabled,
  } = useStore();
  const [text, setText] = useState(SEED);
  const [style, setStyle] = useState(STYLES[0]);
  const [formats, setFormats] = useState<string[]>(["feed", "story", "land"]);
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [preflight, setPreflight] = useState<{
    signature: string;
    estimate: Record<string, unknown>;
    errors: Array<{ rowNumber: number; message: string }>;
  } | null>(null);
  const [preflightBusy, setPreflightBusy] = useState(false);
  const [retryingRow, setRetryingRow] = useState<string | null>(null);

  const items = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const perItem = Math.max(1, formats.length);
  const totalCredits = items.length * perItem;

  const toggleFormat = (id: string) =>
    setFormats((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));

  useEffect(() => {
    if (!backendEnabled || !batchId) return;
    let active = true;
    const poll = async () => {
      try {
        const batch = await getServerBatch(batchId);
        if (!active) return;
        const serverRows = Array.isArray(batch.rows) ? batch.rows : [];
        setRows(
          serverRows.map((row, index) => ({
            id:
              typeof (row as Record<string, unknown>).id === "string"
                ? String((row as Record<string, unknown>).id)
                : undefined,
            name: String(
              (row as Record<string, unknown>).sku ?? items[index] ?? `row-${index + 1}`,
            ),
            style,
            image: "",
            status: String((row as Record<string, unknown>).state ?? "QUEUED").toLowerCase(),
            error:
              (row as Record<string, unknown>).error &&
              typeof (row as Record<string, unknown>).error === "object"
                ? String(
                    ((row as Record<string, unknown>).error as Record<string, unknown>).message ??
                      "",
                  )
                : undefined,
          })),
        );
        const state = String(batch.state ?? "");
        setRunning(["QUEUED", "RUNNING"].includes(state));
      } catch (reason) {
        if (active)
          setError(reason instanceof Error ? reason.message : "Batch status could not be loaded.");
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 2000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [backendEnabled, batchId, style, text]);

  const run = () => {
    if (!items.length || !formats.length) return;
    setError("");
    if (backendEnabled) {
      const preflightRows = items.map((item) => {
        const [sku, ...titleParts] = item.split(",").map((part) => part.trim());
        return { sku, title: titleParts.join(", ") || sku };
      });
      const signature = JSON.stringify({ items, style, formats });
      const briefDefaults = {
        scene: style,
        count: 1,
        mode: "lock",
        qualityMode: "balanced",
        outputFormats: formats.map((id) => FORMATS.find((format) => format.id === id)?.ratio ?? id),
        audience: brand.audience,
        language: brand.language,
        cta: "Shop now",
      };
      if (!preflight || preflight.signature !== signature) {
        setPreflightBusy(true);
        void createServerBatch({
          title:
            "Catalogue batch preflight · " +
            items.length +
            " SKUs × " +
            formats.length +
            " formats",
          rows: preflightRows,
          briefDefaults,
          dryRun: true,
          idempotencyKey: uid("batch-preflight"),
        })
          .then((result) => {
            const resultRecord = result as {
              estimate?: Record<string, unknown>;
              errors?: Array<{ rowNumber: number; message: string }>;
            };
            setPreflight({
              signature,
              estimate: resultRecord.estimate ?? {},
              errors: resultRecord.errors ?? [],
            });
          })
          .catch((reason) =>
            setError(
              reason instanceof Error ? reason.message : "Preflight could not be completed.",
            ),
          )
          .finally(() => setPreflightBusy(false));
        return;
      }
      setRunning(true);
      const queueRows = items.map((item) => {
        const [sku, ...titleParts] = item.split(",").map((part) => part.trim());
        return { sku, title: titleParts.join(", ") || sku };
      });
      void createServerBatch({
        title: `Catalogue batch · ${items.length} SKUs × ${formats.length} formats`,
        rows: queueRows,
        briefDefaults: {
          scene: style,
          count: 1,
          mode: "lock",
          qualityMode: "balanced",
          outputFormats: formats.map(
            (id) => FORMATS.find((format) => format.id === id)?.ratio ?? id,
          ),
          audience: brand.audience,
          language: brand.language,
          cta: "Shop now",
        },
        idempotencyKey: uid("batch"),
      })
        .then((result) => {
          const resultRecord = result as {
            batch?: {
              id?: string;
              rows?: Array<{ id?: string; sku: string; state: string; error?: unknown }>;
            };
            errors?: Array<{ rowNumber: number; message: string }>;
          };
          setBatchId(resultRecord.batch?.id ?? null);
          const errors = resultRecord.errors ?? [];
          setRows(
            (resultRecord.batch?.rows ?? []).map((row, index) => ({
              id: row.id,
              name: row.sku || items[index] || "row-" + (index + 1),
              style,
              image: "",
              status: String(row.state ?? "QUEUED").toLowerCase(),
              error:
                row.error && typeof row.error === "object"
                  ? String((row.error as Record<string, unknown>).message ?? "")
                  : undefined,
            })),
          );
          if (errors.length > 0)
            setError(errors.map((item) => `Row ${item.rowNumber}: ${item.message}`).join(" "));
          setRunning(Boolean(resultRecord.batch?.id));
        })
        .catch((reason) => {
          setRunning(false);
          setError(
            reason instanceof Error ? reason.message : "The server could not start this batch.",
          );
        });
      return;
    }
    const quote = {
      routeId: "image-balanced",
      qualityMode: "balanced" as const,
      credits: totalCredits,
      providerCostMinor: Math.round(totalCredits * 5.5),
      currency: "INR" as const,
      etaSec: items.length * 12,
      outputCount: items.length,
      outputFormats: formats.map((id) => FORMATS.find((format) => format.id === id)?.ratio ?? id),
      label: `Balanced route · ${items.length} catalogue rows`,
    };
    const runId = createWorkflowRun({
      title: `Catalogue batch · ${items.length} SKUs × ${formats.length} formats`,
      brandVersion: brand.version,
      quote,
      brief: {
        product: items.join(", "),
        sku: "CATALOGUE-BATCH",
        scene: style,
        count: items.length,
        mode: "lock",
        qualityMode: "balanced",
        outputFormats: quote.outputFormats,
        audience: brand.audience,
        language: brand.language,
        cta: "Shop now",
      },
    });
    if (!runId) {
      setError(
        `Not enough available credits. ${totalCredits} credits are needed; ${credits - reservedCredits} are available.`,
      );
      return;
    }
    const initial: Row[] = items.map((name, i) => ({
      name,
      style,
      image: backendEnabled ? "" : SAMPLE_IMAGES[i % SAMPLE_IMAGES.length],
      status: "queued",
    }));
    setRows(initial);
    setRunning(true);
    transitionWorkflowRun(runId, "queued");
    transitionWorkflowRun(runId, "running", {
      progress: {
        currentNode: "Validate catalogue rows",
        completed: 0,
        total: items.length,
      },
    });
    initial.forEach((_, i) => {
      setTimeout(() => {
        setRows((r) => r.map((row, idx) => (idx === i ? { ...row, status: "running" } : row)));
        updateWorkflowRun(runId, {
          progress: {
            currentNode: `Render ${items[i]}`,
            completed: i,
            total: items.length,
          },
        });
      }, i * 350);
      setTimeout(
        () => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, status: "done" } : row))),
        i * 350 + 500,
      );
    });
    setTimeout(
      () => {
        setRunning(false);
        const outputs: OutputAsset[] = initial.flatMap((row, rowIndex) =>
          FORMATS.filter((format) => formats.includes(format.id)).map((format) => ({
            id: `${runId}_${rowIndex}_${format.id}`,
            runId,
            name: `${row.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}_${format.id}_v1.png`,
            imgId: row.image,
            format: format.label,
            ratio: format.ratio,
            width: format.id === "land" ? 1920 : 1080,
            height: format.id === "story" ? 1920 : format.id === "land" ? 1005 : 1080,
            locale: brand.language,
            status: "draft" as const,
            aiEdited: true,
          })),
        );
        completeWorkflowRun(runId, outputs, {
          "Product / identity truth": {
            dimension: "Product / identity truth",
            verdict: "pass",
          },
          "Brand rules & typography": {
            dimension: "Brand rules & typography",
            verdict: "pass",
          },
          "Message / claim correctness": {
            dimension: "Message / claim correctness",
            verdict: "warn",
            repair: "Review row-level claims before export",
          },
          "Composition & platform fit": {
            dimension: "Composition & platform fit",
            verdict: "pass",
          },
          "Distinctiveness / authenticity": {
            dimension: "Distinctiveness / authenticity",
            verdict: "pass",
          },
          "Technical export / rights": {
            dimension: "Technical export / rights",
            verdict: "pass",
          },
        });
      },
      items.length * 350 + 600,
    );
  };

  const retryRow = async (row: Row) => {
    if (!backendEnabled || !batchId || !row.id) return;
    setRetryingRow(row.id);
    setError("");
    try {
      await retryServerBatchRow(batchId, row.id);
      setRows((current) =>
        current.map((item) =>
          item.id === row.id ? { ...item, status: "queued", error: undefined } : item,
        ),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "This row could not be retried.");
    } finally {
      setRetryingRow(null);
    }
  };

  const doneCount = rows.filter((r) => ["completed", "done"].includes(r.status)).length;
  const currentSignature = JSON.stringify({ items, style, formats });

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Phase 2 · Batch + guided input"
        title="Batch generation"
        desc="Ek workflow ko poore catalog par ek saath chalao. Paste a product list or CSV, pick a style, choose output formats — every SKU renders in every aspect ratio in one pass."
        right={
          <Btn onClick={run} disabled={running || !items.length}>
            {running
              ? `Rendering ${doneCount}/${items.length}…`
              : backendEnabled
                ? preflightBusy
                  ? "Checking products…"
                  : preflight?.signature === currentSignature
                    ? `Queue batch · ${totalCredits} credits`
                    : "Run preflight"
                : `Run batch · ${totalCredits} credits`}
          </Btn>
        }
      />

      {error && (
        <div className="rounded-xl border border-saffron-deep bg-saffron-deep/8 px-4 py-3 font-mono text-[11px] text-saffron-deep">
          {error}
        </div>
      )}

      {backendEnabled && preflight && preflight.signature === currentSignature && (
        <Panel title="Catalogue preflight · review before queueing">
          <div className="grid gap-px bg-line sm:grid-cols-4">
            <div className="bg-card p-4">
              <div className="font-mono text-[10px] uppercase text-ink-soft">Valid rows</div>
              <div className="mt-1 font-display text-2xl">
                {String(preflight.estimate.validRows ?? 0)}
              </div>
            </div>
            <div className="bg-card p-4">
              <div className="font-mono text-[10px] uppercase text-ink-soft">Blocked rows</div>
              <div className="mt-1 font-display text-2xl text-saffron-deep">
                {String(preflight.estimate.failedRows ?? 0)}
              </div>
            </div>
            <div className="bg-card p-4">
              <div className="font-mono text-[10px] uppercase text-ink-soft">Estimated credits</div>
              <div className="mt-1 font-display text-2xl">
                {String(preflight.estimate.credits ?? 0)}
              </div>
            </div>
            <div className="bg-card p-4">
              <div className="font-mono text-[10px] uppercase text-ink-soft">Estimated time</div>
              <div className="mt-1 font-display text-2xl">
                {String(preflight.estimate.etaSec ?? 0)}s
              </div>
            </div>
          </div>
          <div className="space-y-2 border-t border-line p-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">
              Row-level recovery
            </div>
            {preflight.errors.length === 0 ? (
              <p className="text-sm text-leaf">All rows have a matching product and valid brief.</p>
            ) : (
              preflight.errors.map((item) => (
                <div
                  key={item.rowNumber}
                  className="rounded-lg border border-saffron-deep/30 bg-saffron-deep/5 px-3 py-2 text-sm"
                >
                  Row {item.rowNumber}: {item.message}
                </div>
              ))
            )}
          </div>
        </Panel>
      )}

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* guided input */}
        <div className="space-y-6">
          <Panel title="Catalog input">
            <div className="space-y-4 p-5">
              <label className="block">
                <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">
                  Product list · one per line (CSV paste ok)
                </span>
                <textarea
                  rows={7}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="w-full resize-none rounded-lg border border-line bg-paper px-3 py-2 font-mono text-[12px] outline-none focus:border-saffron-deep"
                />
              </label>
              <div className="font-mono text-[11px] text-ink-soft">
                {items.length} SKUs detected
              </div>
            </div>
          </Panel>

          <Panel title="Guided brief">
            <div className="space-y-4 p-5">
              <label className="block">
                <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">
                  Scene style
                </span>
                <select
                  value={style}
                  onChange={(e) => setStyle(e.target.value)}
                  className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-saffron-deep"
                >
                  {STYLES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <div>
                <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">
                  Output formats
                </span>
                <div className="flex flex-wrap gap-2">
                  {FORMATS.map((f) => {
                    const on = formats.includes(f.id);
                    return (
                      <button
                        key={f.id}
                        onClick={() => toggleFormat(f.id)}
                        className={`rounded-full border px-3 py-1.5 font-mono text-[11px] transition-colors ${
                          on
                            ? "border-saffron-deep bg-saffron-deep text-paper"
                            : "border-line hover:border-ink"
                        }`}
                      >
                        {f.label} · {f.ratio}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="rounded-lg border border-dashed border-line px-3 py-2 font-mono text-[11px] text-ink-soft">
                Applying {brand.name} memory · {brand.language} captions ·{" "}
                {credits - reservedCredits} available credits
              </div>
            </div>
          </Panel>
        </div>

        {/* output grid */}
        <Panel
          title="Output"
          right={
            rows.length > 0 && (
              <span className="font-mono text-[11px] text-ink-soft">
                {doneCount}/{rows.length} done
              </span>
            )
          }
        >
          {rows.length === 0 ? (
            <div className="flex h-64 items-center justify-center px-6 text-center font-mono text-[12px] text-ink-soft">
              Output grid empty — run the batch to render {items.length} SKUs × {formats.length}{" "}
              formats.
            </div>
          ) : (
            <div className="space-y-5 p-5">
              {rows.map((row, i) => (
                <div key={i} className="border-b border-line pb-5 last:border-0 last:pb-0">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium">{row.name}</span>
                    <span
                      className={`font-mono text-[10px] uppercase tracking-[0.1em] ${
                        row.status === "done"
                          ? "text-leaf"
                          : row.status === "running"
                            ? "text-saffron-deep"
                            : "text-ink-soft"
                      }`}
                    >
                      {row.status}
                    </span>
                    {row.error && (
                      <div className="mt-1 max-w-md font-mono text-[10px] text-saffron-deep">
                        {row.error}
                      </div>
                    )}
                    {backendEnabled && row.status === "failed" && row.id && (
                      <button
                        onClick={() => void retryRow(row)}
                        disabled={retryingRow === row.id}
                        className="ml-2 font-mono text-[10px] uppercase text-saffron-deep underline"
                      >
                        {retryingRow === row.id ? "retrying…" : "retry row"}
                      </button>
                    )}
                  </div>
                  <div className="flex gap-3">
                    {FORMATS.filter((f) => formats.includes(f.id)).map((f) => (
                      <figure key={f.id} className="w-28 shrink-0">
                        <div
                          className={`${f.box} overflow-hidden rounded-lg border border-line bg-paper-deep`}
                        >
                          {["done", "completed"].includes(row.status) && row.image ? (
                            <img
                              src={img(row.image, 240, 400)}
                              alt={`${row.name} ${f.label}`}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-center font-mono text-[10px] text-ink-soft">
                              {backendEnabled && ["done", "completed"].includes(row.status)
                                ? "Awaiting signed server output"
                                : null}
                              {row.status === "running" && (
                                <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-saffron-deep" />
                              )}
                            </div>
                          )}
                        </div>
                        <figcaption className="mt-1 text-center font-mono text-[9px] uppercase text-ink-soft">
                          {f.label}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
