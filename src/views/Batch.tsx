import { useState } from "react";
import { PageHeader, Panel, Btn } from "../ui";
import { SAMPLE_IMAGES, STYLES, img } from "../data";
import { useStore } from "../store";
import type { OutputAsset } from "../domain";
import { createServerBatch } from "../client/api";
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
  name: string;
  style: string;
  image: string;
  status: "queued" | "running" | "done";
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
  const [error, setError] = useState("");

  const items = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const perItem = Math.max(1, formats.length);
  const totalCredits = items.length * perItem;

  const toggleFormat = (id: string) =>
    setFormats((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));

  const run = () => {
    if (!items.length || !formats.length) return;
    setError("");
    if (backendEnabled) {
      setRunning(true);
      const rowsForServer = items.map((item) => {
        const [sku, ...titleParts] = item.split(",").map((part) => part.trim());
        return { sku, title: titleParts.join(", ") || sku };
      });
      void createServerBatch({
        title: `Catalogue batch · ${items.length} SKUs × ${formats.length} formats`,
        rows: rowsForServer,
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
            batch?: { rows?: Array<{ sku: string; state: string }> };
            errors?: Array<{ rowNumber: number; message: string }>;
          };
          const errors = resultRecord.errors ?? [];
          setRows(
            items.map((name, index) => ({
              name,
              style,
              image: backendEnabled ? "" : SAMPLE_IMAGES[index % SAMPLE_IMAGES.length],
              status: errors.some((item) => item.rowNumber === index + 1) ? "queued" : "running",
            })),
          );
          if (errors.length > 0)
            setError(errors.map((item) => `Row ${item.rowNumber}: ${item.message}`).join(" "));
          setRunning(false);
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

  const doneCount = rows.filter((r) => r.status === "done").length;

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
              : `Run batch · ${totalCredits} credits`}
          </Btn>
        }
      />

      {error && (
        <div className="rounded-xl border border-saffron-deep bg-saffron-deep/8 px-4 py-3 font-mono text-[11px] text-saffron-deep">
          {error}
        </div>
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
                  </div>
                  <div className="flex gap-3">
                    {FORMATS.filter((f) => formats.includes(f.id)).map((f) => (
                      <figure key={f.id} className="w-28 shrink-0">
                        <div
                          className={`${f.box} overflow-hidden rounded-lg border border-line bg-paper-deep`}
                        >
                          {row.status === "done" && row.image ? (
                            <img
                              src={img(row.image, 240, 400)}
                              alt={`${row.name} ${f.label}`}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-center font-mono text-[10px] text-ink-soft">
                              {backendEnabled && row.status === "done"
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
