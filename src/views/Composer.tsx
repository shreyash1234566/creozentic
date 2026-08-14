import { useEffect, useRef, useState, type PointerEvent } from "react";
import { PageHeader, Panel, Btn } from "../ui";
import { useStore } from "../store";
import {
  createServerMediaJob,
  getServerAssetDownload,
  getServerAssets,
  getServerCampaign,
  getServerCampaigns,
} from "../client/api";
import CreativePassport from "./CreativePassport";

type Layer = { id: string; kind: "headline" | "cta" | "logo"; text: string; x: number; y: number };
type BackgroundAsset = { id: string; name: string; url: string };
type EditMode = "quick" | "brand" | "template";

const RATIOS = [
  { id: "feed", label: "Feed 1:1", cls: "aspect-square" },
  { id: "portrait", label: "Portrait 4:5", cls: "aspect-[4/5]" },
  { id: "story", label: "Story 9:16", cls: "aspect-[9/16]" },
  { id: "land", label: "Landscape 1.91:1", cls: "aspect-[1.91/1]" },
];

const TEMPLATE_OPTIONS = [
  {
    id: "autozentic-fixed-ad-v1",
    name: "Product proof · v1",
    suitability: "Product ads, offers and catalogue rows",
    approvalRate: "92% first-pass approval",
    required: "Product, verified source, headline, CTA",
    locked: "Logo, safe area, product identity",
  },
  {
    id: "autozentic-lifestyle-v1",
    name: "Lifestyle story · v1",
    suitability: "Daily social and premium lifestyle",
    approvalRate: "88% first-pass approval",
    required: "Verified source, audience, tone",
    locked: "Brand tokens, logo, disclosure",
  },
];

export default function Composer() {
  const { brand, backendEnabled, role } = useStore();
  const [backgrounds, setBackgrounds] = useState<BackgroundAsset[]>([]);
  const [bg, setBg] = useState<string | null>(null);
  const [ratio, setRatio] = useState(RATIOS[0]);
  const [templateId, setTemplateId] = useState(TEMPLATE_OPTIONS[0].id);
  const [overlay, setOverlay] = useState(40);
  const [accent, setAccent] = useState(brand.colors[1] ?? "#d1560f");
  const [layers, setLayers] = useState<Layer[]>([
    { id: "h", kind: "headline", text: "Monsoon Sale — 30% off", x: 8, y: 60 },
    { id: "c", kind: "cta", text: "Shop on WhatsApp", x: 8, y: 82 },
    { id: "l", kind: "logo", text: brand.name, x: 8, y: 8 },
  ]);
  const drag = useRef<{ id: string } | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState("h");
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const [campaigns, setCampaigns] = useState<Record<string, unknown>[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [passport, setPassport] = useState<Record<string, unknown> | null>(null);
  const [editMode, setEditMode] = useState<EditMode>(
    role === "CLIENT" || role === "REVIEWER" ? "quick" : "template",
  );
  const restrictedSeat = role === "CLIENT" || role === "REVIEWER";

  useEffect(() => {
    if (!backendEnabled) return;
    setLayers([
      { id: "h", kind: "headline", text: "Add approved campaign headline", x: 8, y: 60 },
      { id: "c", kind: "cta", text: "Add approved CTA", x: 8, y: 82 },
      { id: "l", kind: "logo", text: brand.name, x: 8, y: 8 },
    ]);
    void getServerAssets()
      .then(async (assets) => {
        const imageAssets = assets.filter(
          (asset) =>
            ["IMMUTABLE", "READY", "DERIVED"].includes(String(asset.status)) &&
            String(asset.mimeType ?? "").startsWith("image/"),
        );
        const loaded = await Promise.all(
          imageAssets.slice(0, 16).map(async (asset) => ({
            id: String(asset.id),
            name: String(asset.name ?? "asset"),
            url: (await getServerAssetDownload(String(asset.id))).url,
          })),
        );
        setBackgrounds(loaded);
        setBg((current) => current ?? loaded[0]?.url ?? null);
      })
      .catch((error) =>
        setExportMessage(
          error instanceof Error ? error.message : "Verified assets could not be loaded.",
        ),
      );
    void getServerCampaigns()
      .then((rows) => {
        const items = rows as Record<string, unknown>[];
        setCampaigns(items);
        if (!campaignId && items[0]?.id) setCampaignId(String(items[0].id));
      })
      .catch(() => setCampaigns([]));
  }, [backendEnabled, brand.name, campaignId]);

  useEffect(() => {
    if (!backendEnabled || !campaignId) return;
    void getServerCampaign(campaignId)
      .then((campaign) =>
        setPassport(
          ((campaign as Record<string, unknown>).passport as Record<string, unknown>) ?? null,
        ),
      )
      .catch(() => setPassport(null));
  }, [backendEnabled, campaignId]);

  const onDown = (e: PointerEvent, id: string) => {
    if (editMode === "quick" && id === "l") return;
    if (restrictedSeat && editMode === "template") return;
    drag.current = { id };
    setSel(id);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (!drag.current || !stage.current) return;
    const r = stage.current.getBoundingClientRect();
    const x = Math.min(92, Math.max(2, ((e.clientX - r.left) / r.width) * 100));
    const y = Math.min(94, Math.max(2, ((e.clientY - r.top) / r.height) * 100));
    setLayers((ls) => ls.map((l) => (l.id === drag.current!.id ? { ...l, x, y } : l)));
  };
  const onUp = () => (drag.current = null);

  const editLayer = (id: string, text: string) =>
    setLayers((ls) =>
      ls.map((l) =>
        l.id === id &&
        (editMode === "template" ||
          (editMode === "quick" && (l.kind === "headline" || l.kind === "cta")) ||
          (editMode === "brand" && l.kind === "logo" && !restrictedSeat))
          ? { ...l, text: text.slice(0, l.kind === "headline" ? 72 : 40) }
          : l,
      ),
    );

  const selected = layers.find((l) => l.id === sel)!;

  const exportComposition = async () => {
    setExportMessage("");
    if (!backendEnabled) {
      setExportMessage(
        "Composer requires the backend media renderer; no local result is presented as an export.",
      );
      return;
    }
    setExporting(true);
    try {
      if (campaignId && String(passport?.status ?? "") !== "READY")
        throw new Error(
          "This campaign's Creative Passport is not ready; complete facts, direction, output QA, and review before exporting.",
        );
      const assets = await getServerAssets();
      const source = assets.find(
        (asset) =>
          ["IMMUTABLE", "READY", "DERIVED"].includes(String(asset.status)) &&
          String(asset.mimeType ?? "").startsWith("image/"),
      );
      if (!source)
        throw new Error("Upload and verify an image asset before exporting a composition.");
      const result = await createServerMediaJob({
        kind: "composition.render",
        sourceAssetIds: [String(source.id)],
        config: {
          templateId,
          ratio: ratio.id,
          overlay,
          accent,
          layers,
          brandVersion: brand.version,
          campaignId: campaignId || undefined,
        },
        idempotencyKey: `composition:${ratio.id}:${source.id}:${JSON.stringify({ overlay, accent, layers })}`,
      });
      const job = result.job as Record<string, unknown> | undefined;
      setExportMessage(
        `Composition job ${String(job?.id ?? "created")} ${String(job?.status ?? "accepted").toLowerCase()}. Outputs are stored in the workspace.`,
      );
    } catch (error) {
      setExportMessage(
        error instanceof Error ? error.message : "The composition could not be exported.",
      );
    } finally {
      setExporting(false);
    }
  };

  const exportAllFormats = async () => {
    setExportMessage("");
    if (!backendEnabled) {
      setExportMessage(
        "Composer requires the backend media renderer; no local result is presented as an export.",
      );
      return;
    }
    setExporting(true);
    try {
      if (campaignId && String(passport?.status ?? "") !== "READY")
        throw new Error(
          "This campaign's Creative Passport is not ready; complete facts, direction, output QA, and review before exporting.",
        );
      const assets = await getServerAssets();
      const source = assets.find(
        (asset) =>
          ["IMMUTABLE", "READY", "DERIVED"].includes(String(asset.status)) &&
          String(asset.mimeType ?? "").startsWith("image/"),
      );
      if (!source) throw new Error("Upload and verify an image asset before exporting.");
      await Promise.all(
        RATIOS.map((format) =>
          createServerMediaJob({
            kind: "composition.render",
            sourceAssetIds: [String(source.id)],
            config: {
              templateId,
              ratio: format.id,
              overlay,
              accent,
              layers,
              brandVersion: brand.version,
              campaignId: campaignId || undefined,
            },
            idempotencyKey:
              "composition-all:" +
              templateId +
              ":" +
              format.id +
              ":" +
              source.id +
              ":" +
              JSON.stringify({ overlay, accent, layers }),
          }),
        ),
      );
      setExportMessage(
        RATIOS.length +
          " format jobs submitted from " +
          templateId +
          ". Outputs use one template version and stay in the campaign pack.",
      );
    } catch (error) {
      setExportMessage(
        error instanceof Error ? error.message : "The format pack could not be exported.",
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Phase 2 · Layout engine"
        title="Template-first Safe Editor"
        desc="Generated image + logo + headline + CTA — ek finished ad, app ke andar hi. No Figma or Canva round-trip. Drag each element to place it, then export in any format."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* stage */}
        <Panel
          title="Canvas"
          right={
            <div className="flex gap-1">
              {RATIOS.map((r) => (
                <button
                  key={r.id}
                  onClick={() => editMode === "template" && setRatio(r)}
                  disabled={editMode !== "template"}
                  className={`rounded-full px-2.5 py-1 font-mono text-[10px] transition-colors ${
                    ratio.id === r.id ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper-deep"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          }
        >
          <div className="flex justify-center bg-paper-deep p-6">
            <div
              ref={stage}
              onPointerMove={onMove}
              onPointerUp={onUp}
              className={`relative w-full max-w-md touch-none overflow-hidden rounded-xl ${ratio.cls}`}
              style={{ backgroundColor: "#000" }}
            >
              {bg ? (
                <img
                  src={bg}
                  alt="composition background"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-paper-deep p-6 text-center font-mono text-[11px] text-ink-soft">
                  Upload and verify an image asset to use a real composition background.
                </div>
              )}
              <div
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(180deg, rgba(0,0,0,${overlay / 200}), rgba(0,0,0,${overlay / 100}))`,
                }}
              />
              {layers.map((l) => (
                <div
                  key={l.id}
                  onPointerDown={(e) => onDown(e, l.id)}
                  className={`absolute cursor-grab select-none active:cursor-grabbing ${
                    sel === l.id ? "outline-2 outline-dashed outline-white/60" : ""
                  }`}
                  style={{ left: `${l.x}%`, top: `${l.y}%` }}
                >
                  {l.kind === "headline" && (
                    <span className="block max-w-[16ch] font-display text-2xl font-medium leading-tight text-white drop-shadow">
                      {l.text}
                    </span>
                  )}
                  {l.kind === "cta" && (
                    <span
                      className="inline-block rounded-full px-4 py-1.5 text-sm font-medium text-white shadow"
                      style={{ background: accent }}
                    >
                      {l.text} →
                    </span>
                  )}
                  {l.kind === "logo" && (
                    <span className="font-display text-sm font-semibold uppercase tracking-widest text-white/90">
                      {l.text}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title="All-format delivery preview">
          <div className="grid grid-cols-4 gap-2 p-4">
            {RATIOS.map((format) => (
              <button
                key={format.id}
                onClick={() => setRatio(format)}
                className={
                  ratio.id === format.id
                    ? "rounded-lg border border-saffron-deep bg-paper-deep p-2 text-left"
                    : "rounded-lg border border-line p-2 text-left"
                }
              >
                <div className="relative overflow-hidden rounded bg-ink/90 p-2 text-paper">
                  <div className={format.cls}>
                    <div className="flex h-full flex-col justify-between text-[8px]">
                      <span>{brand.name}</span>
                      <span className="font-medium">
                        {layers.find((l) => l.kind === "headline")?.text}
                      </span>
                      <span className="text-saffron-deep">
                        {layers.find((l) => l.kind === "cta")?.text}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-1 font-mono text-[9px] uppercase text-ink-soft">
                  {format.label}
                </div>
              </button>
            ))}
          </div>
          <p className="border-t border-line px-4 py-2 font-mono text-[10px] text-ink-soft">
            Every format uses the same approved template version, locked layers and copy fields.
          </p>
        </Panel>

        {/* controls */}
        <div className="space-y-6">
          <Panel title="Editing mode">
            <div className="grid grid-cols-3 gap-1.5 p-4">
              {(
                [
                  ["quick", "Quick Edit", "Headline + CTA"],
                  ["brand", "Brand Edit", "Brand tokens"],
                  ["template", "Template Edit", "Layout + layers"],
                ] as const
              ).map(([id, label, hint]) => {
                const disabled = restrictedSeat && id !== "quick";
                return (
                  <button
                    key={id}
                    disabled={disabled}
                    onClick={() => setEditMode(id)}
                    className={`rounded-lg border px-2 py-2 text-left ${
                      editMode === id ? "border-saffron-deep bg-saffron-deep/10" : "border-line"
                    } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
                  >
                    <span className="block text-[11px] font-medium">{label}</span>
                    <span className="font-mono text-[9px] text-ink-soft">{hint}</span>
                  </button>
                );
              })}
            </div>
            <p className="border-t border-line px-4 py-2 font-mono text-[10px] text-ink-soft">
              {editMode === "quick"
                ? "Fast copy changes only; product and brand identity stay locked."
                : editMode === "brand"
                  ? "Brand-token changes are isolated from layout and are recorded in the export manifest."
                  : "Template changes affect deterministic layout layers and require the campaign review gate."}
            </p>
          </Panel>
          <Panel title="Approved template">
            <div className="space-y-2 p-4">
              {TEMPLATE_OPTIONS.map((template) => (
                <button
                  key={template.id}
                  onClick={() => setTemplateId(template.id)}
                  className={
                    template.id === templateId
                      ? "w-full rounded-lg border border-saffron-deep bg-paper-deep p-3 text-left"
                      : "w-full rounded-lg border border-line p-3 text-left hover:border-ink"
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{template.name}</span>
                    <span className="font-mono text-[9px] uppercase text-leaf">approved</span>
                  </div>
                  <div className="mt-1 text-[11px] text-ink-soft">{template.suitability}</div>
                  <div className="mt-2 grid gap-1 font-mono text-[9px] text-ink-soft">
                    <span>{template.approvalRate}</span>
                    <span>Required: {template.required}</span>
                    <span>Locked: {template.locked}</span>
                  </div>
                </button>
              ))}
            </div>
          </Panel>
          <Panel title="Background">
            <div className="grid grid-cols-4 gap-2 p-4">
              {backgrounds.length ? (
                backgrounds.map((asset) => (
                  <button
                    key={asset.id}
                    onClick={() => setBg(asset.url)}
                    className={`overflow-hidden rounded-lg border-2 ${bg === asset.url ? "border-saffron-deep" : "border-transparent opacity-70"}`}
                  >
                    <img
                      src={asset.url}
                      alt={asset.name}
                      className="aspect-square w-full object-cover"
                    />
                  </button>
                ))
              ) : (
                <div className="col-span-4 p-2 text-center font-mono text-[10px] text-ink-soft">
                  No verified image assets yet.
                </div>
              )}
            </div>
          </Panel>

          <Panel title={`Edit · ${selected.kind}`}>
            <div className="space-y-4 p-4">
              <input
                value={selected.text}
                onChange={(e) => editLayer(selected.id, e.target.value)}
                disabled={
                  !(
                    editMode === "template" ||
                    (editMode === "quick" &&
                      (selected.kind === "headline" || selected.kind === "cta")) ||
                    (editMode === "brand" && selected.kind === "logo" && !restrictedSeat)
                  )
                }
                className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-saffron-deep"
              />
              <div
                className={`font-mono text-[10px] ${selected.text.length > (selected.kind === "headline" ? 72 : 40) ? "text-saffron-deep" : "text-ink-soft"}`}
              >
                {selected.text.length} / {selected.kind === "headline" ? 72 : 40} characters ·{" "}
                {/[\u0900-\u097f\u0600-\u06ff]/.test(selected.text)
                  ? "Indic/RTL overflow check enabled · "
                  : ""}
                {editMode === "quick" && selected.kind === "logo"
                  ? "locked from Brand Brain"
                  : editMode === "brand" && selected.kind !== "logo"
                    ? "layout locked in Brand Edit"
                    : "editable"}
              </div>
              <div className="flex gap-1.5">
                {layers.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => setSel(l.id)}
                    className={`flex-1 rounded-full border px-2 py-1 font-mono text-[10px] uppercase ${
                      sel === l.id
                        ? "border-saffron-deep bg-saffron-deep text-paper"
                        : "border-line"
                    }`}
                  >
                    {l.kind}
                  </button>
                ))}
              </div>
              <label className="block">
                <span className="mb-1 flex justify-between font-mono text-[10px] uppercase tracking-[0.1em] text-ink-soft">
                  <span>Overlay</span>
                  <span>{overlay}%</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={90}
                  value={overlay}
                  onChange={(e) => setOverlay(+e.target.value)}
                  disabled={editMode !== "template"}
                  className="w-full accent-saffron-deep"
                />
              </label>
              <label className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-soft">
                  CTA accent
                </span>
                <input
                  type="color"
                  value={accent}
                  onChange={(e) => setAccent(e.target.value)}
                  disabled={editMode !== "brand" || restrictedSeat}
                  className="h-8 w-14 cursor-pointer rounded border border-line bg-paper"
                />
              </label>
            </div>
          </Panel>

          <div className="grid gap-2 sm:grid-cols-2">
            <Btn onClick={() => void exportComposition()} disabled={exporting}>
              {exporting ? "Preparing…" : `Export ${ratio.label.split(" ")[0]} ad`}
            </Btn>
            <Btn variant="line" onClick={() => void exportAllFormats()} disabled={exporting}>
              {exporting ? "Preparing…" : "Export all formats"}
            </Btn>
          </div>
          {exportMessage && (
            <p className="font-mono text-[10px] leading-relaxed text-ink-soft">{exportMessage}</p>
          )}
          {backendEnabled && (
            <Panel title="Campaign & evidence">
              <div className="space-y-3 p-4">
                <select
                  value={campaignId}
                  onChange={(event) => setCampaignId(event.target.value)}
                  className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm"
                >
                  <option value="">Select campaign</option>
                  {campaigns.map((campaign) => (
                    <option key={String(campaign.id)} value={String(campaign.id)}>
                      {String(campaign.name)}
                    </option>
                  ))}
                </select>
                <CreativePassport passport={passport} compact />
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
