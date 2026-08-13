import { useEffect, useState } from "react";
import { MODELS, USD_INR, type ModelInfo } from "../data";
import { useStore } from "../store";
import { PageHeader, Panel, Btn } from "../ui";
import {
  commitServerComparison,
  createServerComparison,
  getServerCapabilities,
} from "../client/api";

const KIND_COLORS: Record<string, string> = {
  image: "text-saffron-deep",
  edit: "text-indigo",
  video: "text-leaf",
  text: "text-ink-soft",
  audio: "text-marigold",
};

type Run = {
  model: ModelInfo;
  image?: string;
  outputId?: string;
  comparisonId?: string;
  done: boolean;
  error?: string;
};

export default function ModelStudio() {
  const { brand, backendEnabled } = useStore();
  const [prompt, setPrompt] = useState(
    "Kosmic 3-seater sofa, styled in a warm Jaipur loft, golden hour light",
  );
  const [selected, setSelected] = useState<string[]>(["sdxl", "imagen", "flux"]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [running, setRunning] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [providerModels, setProviderModels] = useState<ModelInfo[]>([]);

  const catalog = backendEnabled ? providerModels : MODELS;
  const imageModels = catalog.filter((m) => m.kind === "image");

  useEffect(() => {
    if (!backendEnabled) return;
    void getServerCapabilities()
      .then((capabilities) => {
        const models = capabilities.configuredProviders.map((provider) => ({
          id: provider.id,
          name: provider.id,
          provider: "Configured provider",
          kind: "image" as const,
          costUsd: 0,
          avgSec: 0,
          quality: 0,
        }));
        setProviderModels(models);
        setSelected(models.slice(0, 3).map((model) => model.id));
        if (!models.length)
          setError(
            "No production image provider is configured. Add a provider route before comparing models.",
          );
      })
      .catch((reason) =>
        setError(
          reason instanceof Error ? reason.message : "The provider registry could not be loaded.",
        ),
      );
  }, [backendEnabled]);

  const toggle = (id: string) =>
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : s.length < 3 ? [...s, id] : s,
    );

  const compare = () => {
    const chosen = catalog.filter((m) => selected.includes(m.id));
    if (!chosen.length) return;
    setWinner(null);
    setError("");
    setRunning(true);
    if (backendEnabled) {
      void createServerComparison({
        prompt: `${prompt}. Audience: ${brand.audience}. Language: ${brand.language}. Preserve product truth.`,
        modelRefs: chosen.map((model) => model.id),
        constraints: { aspectRatio: "1:1", productLock: true },
        idempotencyKey: `comparison:${prompt}:${selected.join(",")}`,
      })
        .then(({ comparison }) => {
          const outputs = Array.isArray(comparison.outputs) ? comparison.outputs : [];
          setRuns(
            chosen.map((model) => {
              const output = outputs.find(
                (item) =>
                  String((item as Record<string, unknown>).model) === model.id ||
                  String((item as Record<string, unknown>).model)
                    .toLowerCase()
                    .includes(model.id),
              );
              const metadata = (
                output && typeof (output as Record<string, unknown>).metadata === "object"
                  ? (output as Record<string, unknown>).metadata
                  : {}
              ) as Record<string, unknown>;
              const quote = (
                output && typeof (output as Record<string, unknown>).quote === "object"
                  ? (output as Record<string, unknown>).quote
                  : {}
              ) as Record<string, unknown>;
              return {
                model,
                image: typeof metadata.downloadUrl === "string" ? metadata.downloadUrl : undefined,
                outputId: output ? String((output as Record<string, unknown>).id) : undefined,
                comparisonId: String(comparison.id),
                done:
                  String((output as Record<string, unknown> | undefined)?.status) === "COMPLETED",
                error:
                  typeof (output as Record<string, unknown> | undefined)?.error === "object"
                    ? "The provider route failed."
                    : undefined,
              };
            }),
          );
          setRunning(false);
          if (
            !outputs.some(
              (item) => String((item as Record<string, unknown>).status) === "COMPLETED",
            )
          )
            setError("No configured model route produced a verified output.");
        })
        .catch((reason) => {
          setRunning(false);
          setError(
            reason instanceof Error ? reason.message : "The server could not compare routes.",
          );
        });
      return;
    }
    setRunning(false);
    setError(
      "Model Studio requires the backend comparison service; no local sample output is presented.",
    );
  };

  const pick = (m: ModelInfo) => {
    setWinner(m.id);
    const run = runs.find((item) => item.model.id === m.id);
    if (!backendEnabled || !run?.comparisonId || !run.outputId) {
      setError("A verified backend comparison output is required before committing.");
      return;
    }
    void commitServerComparison(run.comparisonId, run.outputId).catch((reason) =>
      setError(
        reason instanceof Error ? reason.message : "The comparison output could not be committed.",
      ),
    );
  };

  const inr = (u: number) => `₹${(u * USD_INR).toFixed(2)}`;

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Phase 1 · Model router + comparison"
        title="Model studio"
        desc="Kai providers ek hi interface ke peeche. Run one prompt across 2–3 models side by side, see real cost & latency, then commit credits only to the best — or cheapest — result."
      />

      {error && <p className="font-mono text-[11px] text-saffron-deep">{error}</p>}

      {/* provider registry */}
      <Panel title="Provider registry · unified interface">
        <div className="grid gap-px overflow-hidden bg-line sm:grid-cols-2 lg:grid-cols-4">
          {catalog.map((m) => (
            <div key={m.id} className="bg-card px-4 py-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{m.name}</span>
                <span className={`font-mono text-[10px] uppercase ${KIND_COLORS[m.kind]}`}>
                  {m.kind}
                </span>
              </div>
              <div className="mt-1 font-mono text-[11px] text-ink-soft">{m.provider}</div>
              <div className="mt-3 flex items-center justify-between font-mono text-[11px]">
                <span className="text-ink-soft">
                  {m.costUsd ? inr(m.costUsd) : "provider quote"}
                </span>
                <span className="text-ink-soft">{m.avgSec ? `${m.avgSec}s` : "live"}</span>
                <span className="text-marigold">{m.quality ? "★".repeat(m.quality) : "—"}</span>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {/* comparison bench */}
      <Panel
        title="Comparison bench"
        right={
          <span className="font-mono text-[11px] text-ink-soft">{selected.length}/3 models</span>
        }
      >
        <div className="p-5">
          <textarea
            rows={2}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full resize-none rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-saffron-deep"
          />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {imageModels.map((m) => {
              const on = selected.includes(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => toggle(m.id)}
                  className={`rounded-full border px-3 py-1.5 font-mono text-[11px] transition-colors ${
                    on
                      ? "border-saffron-deep bg-saffron-deep text-paper"
                      : "border-line hover:border-ink"
                  }`}
                >
                  {m.name}
                </button>
              );
            })}
            <Btn className="ml-auto" onClick={compare} disabled={running || !selected.length}>
              {running ? "Generating…" : "Run comparison"}
            </Btn>
          </div>

          {runs.length > 0 && (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {runs.map((r) => {
                const cheapest = runs.every((o) => o.model.costUsd >= r.model.costUsd);
                return (
                  <div
                    key={r.model.id}
                    className={`overflow-hidden rounded-xl border transition-colors ${
                      winner === r.model.id ? "border-leaf" : "border-line"
                    }`}
                  >
                    <div className="relative aspect-[4/3] bg-paper-deep">
                      {r.done && r.image ? (
                        <img
                          src={r.image}
                          alt={r.model.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <span className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-saffron-deep" />
                        </div>
                      )}
                      {cheapest && r.done && (
                        <span className="absolute left-2 top-2 rounded-full bg-leaf px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-paper">
                          cheapest
                        </span>
                      )}
                    </div>
                    <div className="p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{r.model.name}</span>
                        <span className="text-marigold">
                          {r.model.quality ? "★".repeat(r.model.quality) : "—"}
                        </span>
                      </div>
                      <div className="mt-1 flex justify-between font-mono text-[11px] text-ink-soft">
                        <span>{r.model.costUsd ? inr(r.model.costUsd) : "provider quote"}</span>
                        <span>{r.model.avgSec ? `${r.model.avgSec}s` : "live"}</span>
                      </div>
                      <Btn
                        variant={winner === r.model.id ? "solid" : "line"}
                        className="mt-3 w-full"
                        disabled={!r.done}
                        onClick={() => pick(r.model)}
                      >
                        {winner === r.model.id ? "✓ Committed" : "Pick & commit"}
                      </Btn>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
