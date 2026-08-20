import { useEffect, useState } from "react";
import { PageHeader, Panel, Btn } from "../ui";
import { useStore } from "../store";
import { SAMPLE_IMAGES, img } from "../data";
import { createServerReferencePack, getServerState } from "../client/api";
import { uid } from "../domain";
import ScoreCard, { DIMENSIONS, type ScoreRow, type Verdict, hasCritical } from "./ScoreCard";

type Ref = { id: string; imgId: string; label: string; angle: string };

const PRODUCT_REFS: Ref[] = [
  { id: "r1", imgId: SAMPLE_IMAGES[0], label: "Front 3/4", angle: "hero" },
  { id: "r2", imgId: SAMPLE_IMAGES[1], label: "Side profile", angle: "left 90°" },
  { id: "r3", imgId: SAMPLE_IMAGES[6], label: "Detail · stitching", angle: "macro" },
  { id: "r4", imgId: SAMPLE_IMAGES[2], label: "In-room scale", angle: "lifestyle" },
];

// identity rules that must hold across every generated frame
const IDENTITY_RULES = [
  { rule: "Boucle fabric weave & oat colour", locked: true },
  { rule: "Tapered teak legs (4)", locked: true },
  { rule: "3-seat silhouette + width ratio", locked: true },
  { rule: "Background / scene", locked: false },
  { rule: "Lighting & time of day", locked: false },
];

// generated frames vs reference — creative mode drifts on locked identity
const buildFrames = (mode: "lock" | "creative") =>
  SAMPLE_IMAGES.slice(0, 5).map((imgId, i) => ({
    imgId,
    conf: mode === "lock" ? 0.98 - i * 0.02 : i === 3 ? 0.58 : 0.93 - i * 0.03,
    drift:
      mode === "creative" && i === 3 ? "Leg count changed (4 → 3) · silhouette drift" : undefined,
  }));

export default function Consistency() {
  const { brand, logAudit, backendEnabled } = useStore();
  const [mode, setMode] = useState<"lock" | "creative">("lock");
  const [seed, setSeed] = useState(true);
  const [serverAssets, setServerAssets] = useState<
    Awaited<ReturnType<typeof getServerState>>["assets"]
  >([]);
  const [serverProducts, setServerProducts] = useState<
    Awaited<ReturnType<typeof getServerState>>["products"]
  >([]);
  const [serverStatus, setServerStatus] = useState("");
  const frames = backendEnabled ? [] : buildFrames(mode);
  const references = backendEnabled ? [] : PRODUCT_REFS;

  useEffect(() => {
    if (!backendEnabled) return;
    void getServerState()
      .then((state) => {
        setServerAssets(state.assets.filter((asset) => asset.status !== "SOFT_DELETED"));
        setServerProducts(state.products);
      })
      .catch((error) =>
        setServerStatus(
          error instanceof Error ? error.message : "Server references could not be loaded.",
        ),
      );
  }, [backendEnabled]);

  const saveReferencePack = () => {
    if (!backendEnabled) {
      logAudit(
        "locked reference pack",
        `${brand.name} · Kadam sofa · seed ${seed ? "fixed" : "random"}`,
      );
      return;
    }
    const productAsset = serverAssets.find((asset) => asset.productId);
    const product = serverProducts.find((item) => item.sku === "KOS-SOF-114") ?? serverProducts[0];
    if (!productAsset) {
      setServerStatus(
        "Upload and verify a product reference asset before saving a server reference pack.",
      );
      return;
    }
    void createServerReferencePack({
      name: `${brand.name} · Kadam sofa reference · ${uid("pack")}`,
      productId: product?.id,
      mode: mode === "lock" ? "PRODUCT_LOCK" : "CREATIVE",
      seed: seed ? "autozentic-fixed-seed-v1" : undefined,
      referenceAssetIds: [productAsset.id],
      identityRules: {
        locked: IDENTITY_RULES.filter((rule) => rule.locked).map((rule) => rule.rule),
        free: IDENTITY_RULES.filter((rule) => !rule.locked).map((rule) => rule.rule),
      },
    })
      .then(() =>
        setServerStatus(
          "Reference pack saved as a draft. Approve it before consistency checks can run.",
        ),
      )
      .catch((error) =>
        setServerStatus(
          error instanceof Error ? error.message : "The reference pack could not be saved.",
        ),
      );
  };

  const driftFrame = frames.find((f) => f.drift);
  const verdicts: Record<string, { verdict: Verdict; repair?: string }> = {
    "Product / identity truth": driftFrame
      ? { verdict: "critical", repair: driftFrame.drift }
      : { verdict: "pass" },
    "Brand rules & typography": { verdict: "pass" },
    "Message / claim correctness": { verdict: "pass" },
    "Composition & platform fit": { verdict: "pass" },
    "Distinctiveness / authenticity": {
      verdict: mode === "lock" ? "warn" : "pass",
      repair: mode === "lock" ? "Frames 1–3 share an angle — vary composition" : undefined,
    },
    "Technical export / rights": { verdict: "pass" },
  };
  const rows: ScoreRow[] = DIMENSIONS.map((d) => ({
    ...d,
    verdict: verdicts[d.dim]?.verdict ?? "pass",
    repair: verdicts[d.dim]?.repair,
  }));
  const blocked = hasCritical(rows);

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Phase 3 · Consistency"
        title="Product & character consistency"
        desc="Ek campaign ek jaisa dikhe — random AI outputs nahi. Labeled reference pack + identity rules define karte hain kya fixed hai; product-lock mode exact product rakhta hai, creative mode inspiration ke liye. Identity drift auto-detect hokar review block karta hai."
        right={<Btn onClick={saveReferencePack}>Save reference pack</Btn>}
      />

      {serverStatus && <p className="font-mono text-[11px] text-ink-soft">{serverStatus}</p>}

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <div className="space-y-6">
          <Panel title="Reference pack · labeled">
            <div className="grid grid-cols-2 gap-3 p-4">
              {references.map((r) => (
                <figure key={r.id} className="overflow-hidden rounded-lg border border-line">
                  <img
                    src={img(r.imgId, 200, 150)}
                    alt={r.label}
                    className="aspect-[4/3] w-full object-cover"
                  />
                  <figcaption className="px-2 py-1.5">
                    <div className="text-[12px] font-medium leading-tight">{r.label}</div>
                    <div className="font-mono text-[9px] uppercase text-ink-soft">{r.angle}</div>
                  </figcaption>
                </figure>
              ))}
            </div>
          </Panel>

          <Panel title="Identity rules">
            <div className="space-y-1 p-4">
              {IDENTITY_RULES.map((r) => (
                <div
                  key={r.rule}
                  className="flex items-center gap-2 rounded-lg border border-line px-3 py-2"
                >
                  <span className={r.locked ? "text-saffron-deep" : "text-ink-soft"}>
                    {r.locked ? "🔒" : "○"}
                  </span>
                  <span className="flex-1 text-[13px]">{r.rule}</span>
                  <span className="font-mono text-[9px] uppercase text-ink-soft">
                    {r.locked ? "locked" : "free"}
                  </span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Campaign identity settings">
            <div className="space-y-4 p-4">
              <div>
                <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">
                  Mode
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {(["lock", "creative"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={`rounded-xl border p-3 text-left transition-colors ${
                        mode === m
                          ? "border-saffron-deep bg-paper-deep"
                          : "border-line hover:border-ink"
                      }`}
                    >
                      <div className="text-sm font-medium">
                        {m === "lock" ? "Product-lock" : "Creative"}
                      </div>
                      <div className="mt-0.5 text-[11px] leading-snug text-ink-soft">
                        {m === "lock" ? "Exact product across frames" : "Loose inspiration allowed"}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center justify-between">
                <span className="text-sm">Fixed seed + settings</span>
                <input
                  type="checkbox"
                  checked={seed}
                  onChange={(e) => setSeed(e.target.checked)}
                  className="h-4 w-4 accent-saffron-deep"
                />
              </label>
              <p className="font-mono text-[10px] leading-relaxed text-ink-soft">
                Reference IDs, seed and settings are stored per campaign and carried through image →
                video steps.
              </p>
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel
            title={`Generated frames · ${mode} mode`}
            right={
              <span className="font-mono text-[11px] text-ink-soft">
                identity confidence per frame
              </span>
            }
          >
            <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3 lg:grid-cols-5">
              {frames.map((f, i) => (
                <figure
                  key={i}
                  className={`overflow-hidden rounded-lg border ${f.drift ? "border-saffron-deep" : "border-line"}`}
                >
                  <div className="relative">
                    <img
                      src={img(f.imgId, 200, 250)}
                      alt={`frame ${i + 1}`}
                      className="aspect-[4/5] w-full object-cover"
                    />
                    <span
                      className={`absolute left-1.5 top-1.5 rounded-full px-1.5 py-0.5 font-mono text-[9px] ${
                        f.conf < 0.7 ? "bg-saffron-deep text-paper" : "bg-leaf text-paper"
                      }`}
                    >
                      {Math.round(f.conf * 100)}%
                    </span>
                  </div>
                  {f.drift && (
                    <figcaption className="px-2 py-1.5 font-mono text-[9px] leading-tight text-saffron-deep">
                      ⚠ {f.drift}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
            <div
              className={`border-t border-line px-5 py-3 text-sm font-medium ${blocked ? "text-saffron-deep" : "text-leaf"}`}
            >
              {blocked
                ? "Identity drift detected — frame blocked for review. Re-run in product-lock mode or fix the reference."
                : "All frames within identity tolerance — campaign is visually consistent."}
            </div>
          </Panel>

          <Panel title="Consistency gate">
            <div className="p-5">
              <ScoreCard rows={rows} kind="static" />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
