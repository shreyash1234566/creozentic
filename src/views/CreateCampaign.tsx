import { useEffect, useMemo, useState } from "react";
import { Btn, PageHeader, Panel } from "../ui";
import {
  attachServerRunToCampaign,
  createServerCampaign,
  createServerCampaignDirections,
  getServerProducts,
  selectServerCampaignDirection,
  startServerRun,
  updateServerCampaignFacts,
} from "../client/api";
import { FORMAT_REGISTRY, quoteProductLock, type QualityMode } from "../domain";

const OUTCOMES = [
  ["daily", "Daily social post", "One useful organic post from approved content pillars."],
  ["product", "Product ad", "Accurate product ads for paid or organic use."],
  ["offer", "Offer or sale pack", "A promotion with verified price and expiry date."],
  ["ugc", "UGC ad", "Real footage first, with consent and disclosure controls."],
  ["refresh", "Refresh a winner", "Controlled variants without changing what already works."],
  ["catalogue", "Catalogue campaign", "Run an approved recipe across selected products."],
] as const;

const ROUTES = [
  [
    "proof",
    "Product proof / catalogue clean",
    "Preserves product shape, source, and locked commercial facts.",
  ],
  [
    "lifestyle",
    "Premium lifestyle",
    "Changes scene and composition while keeping the product evidence attached.",
  ],
  ["urgency", "Offer urgency", "Adds sale energy only after price and end date are confirmed."],
  ["ugc", "UGC demonstration", "Uses real footage or a consented/disclosed synthetic route."],
] as const;

type Product = {
  id: string;
  sku: string;
  title: string;
  sourceAssetIds?: unknown;
  brandId?: string | null;
};
type Direction = Record<string, unknown>;
const inputClass =
  "w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-saffron-deep";

export default function CreateCampaign({ go }: { go: (view: string) => void }) {
  const backendEnabled = process.env.NEXT_PUBLIC_BACKEND_ENABLED === "true";
  const [step, setStep] = useState(1);
  const [outcome, setOutcome] = useState("product");
  const [route, setRoute] = useState("proof");
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState("");
  const [name, setName] = useState("");
  const [offer, setOffer] = useState("");
  const [offerEndDate, setOfferEndDate] = useState("");
  const [audience, setAudience] = useState("First-home buyers");
  const [language, setLanguage] = useState("Hinglish");
  const [channels, setChannels] = useState(["Instagram Feed", "Instagram Story"]);
  const [formats, setFormats] = useState(["1:1", "4:5", "9:16", "16:9"]);
  const [qualityMode, setQualityMode] = useState<QualityMode>("balanced");
  const [truthConfirmed, setTruthConfirmed] = useState(false);
  const [claim, setClaim] = useState("");
  const [createdId, setCreatedId] = useState("");
  const [directions, setDirections] = useState<Direction[]>([]);
  const [selectedDirectionId, setSelectedDirectionId] = useState("");
  const [productionRunId, setProductionRunId] = useState("");
  const [productionBusy, setProductionBusy] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!backendEnabled) return;
    void getServerProducts()
      .then((rows) => {
        const items = rows as Product[];
        setProducts(items);
        if (items[0]) {
          setProductId(items[0].id);
          setName(`${items[0].title} · ${outcome === "offer" ? "offer" : "creative"} pack`);
        }
      })
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : "Products could not be loaded."),
      );
  }, [backendEnabled]);

  const selectedProduct = products.find((product) => product.id === productId);
  const quote = useMemo(
    () =>
      quoteProductLock({
        count: outcome === "catalogue" ? 3 : 1,
        qualityMode,
        productLock: outcome !== "ugc",
        outputFormats: formats,
      }),
    [outcome, qualityMode, formats],
  );
  const offerRequired = outcome === "offer" || Boolean(offer.trim());
  const canContinueFacts =
    Boolean(selectedProduct) &&
    Boolean(name.trim()) &&
    (!offerRequired || Boolean(offerEndDate)) &&
    truthConfirmed;

  const toggleChannel = (channel: string) =>
    setChannels((current) =>
      current.includes(channel)
        ? current.filter((item) => item !== channel)
        : [...current, channel],
    );
  const toggleFormat = (format: string) =>
    setFormats((current) =>
      current.includes(format) ? current.filter((item) => item !== format) : [...current, format],
    );

  const create = async () => {
    if (!selectedProduct || !channels.length) return;
    setBusy(true);
    setError("");
    try {
      const created = await createServerCampaign({
        name,
        objective: OUTCOMES.find(([id]) => id === outcome)?.[1] ?? "Creative campaign",
        brandId: selectedProduct.brandId ?? undefined,
        productIds: [selectedProduct.id],
        channels,
        offer: offer.trim() ? { text: offer.trim(), endDate: offerEndDate } : undefined,
        audience: { label: audience, language },
        legalCopy: { route, formats },
      });
      const campaignId = String(created.campaignId ?? rec(created.campaign).id ?? "");
      if (!campaignId) throw new Error("The campaign was created without a campaign identifier.");
      await updateServerCampaignFacts(campaignId, [
        {
          field: "product",
          value: `${selectedProduct.title} · ${selectedProduct.sku}`,
          source: `product ${selectedProduct.sku}`,
          state: "LOCKED",
        },
        { field: "audience", value: audience, source: "owner brief", state: "DRAFT" },
        { field: "language", value: language, source: "owner brief", state: "SELECTED" },
        { field: "channels", value: channels, source: "owner brief", state: "SELECTED" },
        ...(offer.trim()
          ? [
              {
                field: "offer",
                value: offer.trim(),
                source: "owner confirmation",
                state: "CONFIRMED",
                expiresAt: offerEndDate,
              },
            ]
          : []),
        ...(offerEndDate
          ? [
              {
                field: "offerEndDate",
                value: offerEndDate,
                source: "owner confirmation",
                state: "CONFIRMED",
                expiresAt: offerEndDate,
              },
            ]
          : []),
        ...(claim.trim()
          ? [
              {
                field: "claim",
                value: claim.trim(),
                source: "owner confirmation",
                state: "CONFIRMED",
              },
            ]
          : []),
      ]);
      const createdDirections = await createServerCampaignDirections(campaignId);
      setDirections(createdDirections);
      setSelectedDirectionId(String(createdDirections[0]?.id ?? ""));
      setCreatedId(campaignId);
      setStep(4);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The campaign could not be created.");
    } finally {
      setBusy(false);
    }
  };

  const startProduction = async () => {
    if (!createdId || !selectedProduct || !selectedDirectionId) return;
    setProductionBusy(true);
    setError("");
    try {
      await selectServerCampaignDirection(createdId, selectedDirectionId);
      const direction = directions.find((item) => String(item.id) === selectedDirectionId) ?? {};
      const copy = rec(direction.copy);
      const result = await startServerRun({
        title: `${name} · ${String(direction.name ?? "selected direction")}`,
        idempotencyKey: `campaign-pack:${createdId}:${selectedDirectionId}`,
        brief: {
          product: selectedProduct.title,
          sku: selectedProduct.sku,
          scene: String(direction.route ?? route),
          count: 1,
          mode: outcome === "ugc" ? "creative" : "lock",
          qualityMode,
          outputFormats: formats,
          audience,
          language,
          cta: String(copy.cta ?? "Shop now"),
          headline: String(copy.headline ?? ""),
          body: String(copy.body ?? ""),
          hashtags: Array.isArray(copy.hashtags)
            ? copy.hashtags.filter((item): item is string => typeof item === "string")
            : [],
          altText: String(copy.altText ?? ""),
          campaignId: createdId,
          directionId: selectedDirectionId,
        },
      });
      const runId = String(result.run?.id ?? "");
      if (!runId) throw new Error("The production run was created without an identifier.");
      await attachServerRunToCampaign(createdId, runId);
      setProductionRunId(runId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The campaign pack could not start.");
    } finally {
      setProductionBusy(false);
    }
  };

  if (!backendEnabled) {
    return (
      <div className="space-y-8">
        <PageHeader
          kicker="Create · production workspace"
          title="Create campaign"
          desc="The guided campaign flow is server-backed. Connect the production workspace before creating paid or publishable work."
        />
        <Panel title="Backend required">
          <div className="p-6 text-sm text-ink-soft">
            No local campaign is created here, so demo state cannot be mistaken for a customer
            campaign.
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="P0 · Outcome-first creation"
        title="Create campaign"
        desc="Choose the business outcome, confirm Truth Lock facts, select a safe creative route, and receive a decision-sized pack."
        right={
          step > 1 && step < 4 ? (
            <Btn variant="line" onClick={() => setStep((current) => current - 1)}>
              Back
            </Btn>
          ) : undefined
        }
      />
      {error && (
        <div className="rounded-xl border border-saffron-deep bg-saffron-deep/8 px-4 py-3 font-mono text-[11px] text-saffron-deep">
          {error}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">
        {["Outcome", "Truth Lock", "Creative route", "Pack"].map((label, index) => (
          <span
            key={label}
            className={
              step === index + 1 ? "text-saffron-deep" : index + 1 < step ? "text-leaf" : ""
            }
          >
            {index + 1}. {label}
            {index < 3 && <span className="px-2 text-line">—</span>}
          </span>
        ))}
      </div>

      {step === 1 && (
        <Panel title="What should be ready for you?">
          <div className="grid gap-3 p-5 md:grid-cols-2 lg:grid-cols-3">
            {OUTCOMES.map(([id, label, desc]) => (
              <button
                key={id}
                onClick={() => {
                  setOutcome(id);
                  if (!name) setName(`${label} · campaign`);
                }}
                className={`rounded-xl border p-4 text-left transition-colors ${outcome === id ? "border-saffron-deep bg-paper-deep" : "border-line hover:border-ink"}`}
              >
                <div className="text-sm font-medium">{label}</div>
                <div className="mt-1 text-[12px] leading-relaxed text-ink-soft">{desc}</div>
              </button>
            ))}
          </div>
          <div className="flex justify-end border-t border-line px-5 py-4">
            <Btn onClick={() => setStep(2)}>Confirm outcome →</Btn>
          </div>
        </Panel>
      )}

      {step === 2 && (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <Panel title="Truth Lock · confirm business facts">
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="field-label">Campaign name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className={inputClass}
                />
              </label>
              <label>
                <span className="field-label">Product / SKU</span>
                <select
                  value={productId}
                  onChange={(event) => setProductId(event.target.value)}
                  className={inputClass}
                >
                  <option value="">Select verified product</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.title} · {product.sku}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="field-label">Audience</span>
                <input
                  value={audience}
                  onChange={(event) => setAudience(event.target.value)}
                  className={inputClass}
                />
              </label>
              <label>
                <span className="field-label">Offer / price note</span>
                <input
                  value={offer}
                  onChange={(event) => setOffer(event.target.value)}
                  placeholder="15% off"
                  className={inputClass}
                />
              </label>
              <label>
                <span className="field-label">Product / claim proof</span>
                <input
                  value={claim}
                  onChange={(event) => setClaim(event.target.value)}
                  placeholder="Hand-finished teak"
                  className={inputClass}
                />
              </label>
              <label>
                <span className="field-label">Offer end date {offerRequired && "· required"}</span>
                <input
                  type="date"
                  value={offerEndDate}
                  onChange={(event) => setOfferEndDate(event.target.value)}
                  className={inputClass}
                />
              </label>
              <label>
                <span className="field-label">Language</span>
                <select
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                  className={inputClass}
                >
                  <option>Hinglish</option>
                  <option>Hindi</option>
                  <option>English</option>
                  <option>Marathi</option>
                  <option>Tamil</option>
                </select>
              </label>
              <div>
                <span className="field-label">Channels</span>
                <div className="flex flex-wrap gap-2">
                  {["Instagram Feed", "Instagram Story", "WhatsApp", "Facebook"].map((channel) => (
                    <button
                      key={channel}
                      onClick={() => toggleChannel(channel)}
                      className={`rounded-full border px-2.5 py-1 font-mono text-[10px] ${channels.includes(channel) ? "border-saffron-deep bg-saffron-deep text-paper" : "border-line text-ink-soft"}`}
                    >
                      {channel}
                    </button>
                  ))}
                </div>
              </div>
              <label className="sm:col-span-2 flex items-start gap-3 rounded-lg border border-line bg-paper-deep p-3">
                <input
                  type="checkbox"
                  checked={truthConfirmed}
                  onChange={(event) => setTruthConfirmed(event.target.checked)}
                  className="mt-1"
                />
                <span className="text-sm">
                  I confirm the product, price/offer, and expiry date above are the facts Creozentic
                  may lock into this campaign.
                </span>
              </label>
            </div>
            <div className="flex justify-end border-t border-line px-5 py-4">
              <Btn onClick={() => setStep(3)} disabled={!canContinueFacts}>
                Choose creative route →
              </Btn>
            </div>
          </Panel>
          <Panel title="Fact state">
            <div className="space-y-3 p-5">
              <FactState
                label="Product"
                value={
                  selectedProduct ? `${selectedProduct.title} · ${selectedProduct.sku}` : "Required"
                }
                state={selectedProduct ? "Locked" : "Needs confirmation"}
              />
              <FactState
                label="Offer"
                value={offer || "Not supplied"}
                state={offerRequired ? (offerEndDate ? "Confirmed" : "Required") : "Flexible"}
              />
              <FactState label="Audience" value={audience} state="Draft" />
              <FactState label="Language" value={language} state="Selected" />
            </div>
          </Panel>
        </div>
      )}

      {step === 3 && (
        <Panel title="Choose a safe creative route">
          <div className="grid gap-3 p-5 md:grid-cols-2">
            {ROUTES.filter(([id]) => outcome !== "ugc" || id === "ugc").map(([id, label, desc]) => (
              <button
                key={id}
                onClick={() => setRoute(id)}
                className={`rounded-xl border p-4 text-left ${route === id ? "border-saffron-deep bg-paper-deep" : "border-line hover:border-ink"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{label}</span>
                  <span className="font-mono text-[10px] text-saffron-deep">
                    {route === id ? "selected" : "choose"}
                  </span>
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-soft">{desc}</p>
                <p className="mt-3 font-mono text-[10px] text-ink-soft">
                  Formats: {formats.join(" · ")} · estimated {quote.etaSec}s
                </p>
              </button>
            ))}
          </div>
          <div className="border-t border-line px-5 py-4">
            <div className="mb-3 field-label">Pack formats</div>
            <div className="flex flex-wrap gap-2">
              {FORMAT_REGISTRY.slice(0, 4).map((format) => (
                <button
                  key={format.id}
                  onClick={() => toggleFormat(format.ratio)}
                  className={`rounded-full border px-2.5 py-1 font-mono text-[10px] ${formats.includes(format.ratio) ? "border-saffron-deep bg-saffron-deep text-paper" : "border-line text-ink-soft"}`}
                >
                  {format.label}
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <select
                value={qualityMode}
                onChange={(event) => setQualityMode(event.target.value as QualityMode)}
                className="rounded-lg border border-line bg-paper px-3 py-2 text-sm"
              >
                <option value="fast">Fast · lower cost</option>
                <option value="balanced">Balanced · recommended</option>
                <option value="quality">Quality · higher cost</option>
              </select>
              <Btn onClick={() => setStep(4)}>Review pack estimate →</Btn>
            </div>
          </div>
        </Panel>
      )}

      {step === 4 &&
        (createdId ? (
          <Panel title="Campaign pack created">
            <div className="space-y-4 p-6">
              <div className="rounded-xl border border-leaf bg-leaf/8 p-4">
                <div className="text-sm font-medium">
                  Truth Lock facts are attached. Choose one of the three directions before any paid
                  generation starts.
                </div>
                <div className="mt-1 font-mono text-[10px] text-ink-soft">
                  Campaign {createdId.slice(-10)} · {name}
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {directions.map((direction) => {
                  const copy = rec(direction.copy);
                  const selected = String(direction.id) === selectedDirectionId;
                  return (
                    <button
                      key={String(direction.id)}
                      onClick={() => setSelectedDirectionId(String(direction.id))}
                      className={`rounded-xl border p-4 text-left ${selected ? "border-saffron-deep bg-paper-deep" : "border-line hover:border-ink"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{String(direction.name)}</span>
                        <span className="font-mono text-[9px] uppercase text-saffron-deep">
                          {selected ? "selected" : "choose"}
                        </span>
                      </div>
                      <p className="mt-2 text-[12px] text-ink-soft">{String(direction.promise)}</p>
                      <p className="mt-3 font-display text-base">{String(copy.headline ?? "")}</p>
                      <p className="mt-1 font-mono text-[10px] text-ink-soft">
                        {String(direction.visual)}
                      </p>
                    </button>
                  );
                })}
              </div>
              <div className="rounded-lg border border-line bg-paper-deep px-4 py-3 font-mono text-[10px] text-ink-soft">
                {productionRunId
                  ? `Production run ${productionRunId.slice(-10)} is queued. Outputs, Passport evidence and review state will update from the server.`
                  : "No generation has started. Your maximum estimate remains visible from the selected format set."}
              </div>
              <div className="flex flex-wrap gap-2">
                <Btn onClick={() => go("campaigns")}>Open campaign pack</Btn>
                <Btn
                  variant="line"
                  onClick={() => void startProduction()}
                  disabled={productionBusy || !selectedDirectionId || Boolean(productionRunId)}
                >
                  {productionBusy
                    ? "Starting…"
                    : productionRunId
                      ? "Production queued"
                      : "Start selected pack"}
                </Btn>
                <Btn
                  variant="ghost"
                  onClick={() => go(outcome === "ugc" ? "video" : "productlock")}
                >
                  Open studio
                </Btn>
              </div>
            </div>
          </Panel>
        ) : (
          <Panel title="Before production starts">
            <div className="grid gap-px bg-line sm:grid-cols-3">
              <Estimate
                label="Maximum estimate"
                value={`${quote.credits} credits`}
                sub="reserved before spend"
              />
              <Estimate
                label="INR estimate"
                value={`₹${(quote.providerCostMinor / 100).toFixed(2)}`}
                sub="provider route estimate"
              />
              <Estimate
                label="Output set"
                value={`${formats.length} formats`}
                sub="decision-sized first pack"
              />
            </div>
            <div className="border-t border-line px-5 py-4">
              <p className="max-w-2xl text-sm text-ink-soft">
                This contract preserves the selected product and commercial facts, runs the chosen
                route, and sends the resulting pack for approval. No publishing is implied.
              </p>
              <div className="mt-4 flex justify-end">
                <Btn
                  onClick={() => void create()}
                  disabled={busy || !channels.length || !selectedProduct}
                >
                  {busy ? "Creating…" : "Create campaign pack"}
                </Btn>
              </div>
            </div>
          </Panel>
        ))}
    </div>
  );
}

function FactState({ label, value, state }: { label: string; value: string; state: string }) {
  return (
    <div className="border-b border-line pb-3 last:border-0">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <span className="font-mono text-[10px] uppercase text-saffron-deep">{state}</span>
      </div>
      <div className="mt-1 text-[12px] text-ink-soft">{value}</div>
    </div>
  );
}
function Estimate({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-card px-5 py-5">
      <div className="field-label">{label}</div>
      <div className="mt-1 font-display text-2xl text-saffron-deep">{value}</div>
      <div className="mt-1 font-mono text-[10px] text-ink-soft">{sub}</div>
    </div>
  );
}
function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
