import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader, Panel, Btn, Stat } from "../ui";
import { useStore } from "../store";
import { SAMPLE_IMAGES, img } from "../data";
import {
  completeServerAsset,
  createServerUploadIntent,
  getServerAssetDownload,
  getServerAssets,
  getServerProducts,
} from "../client/api";

type AssetType = "original" | "product" | "logo" | "generated" | "approved" | "export";

type Asset = {
  id: string;
  name: string;
  type: AssetType;
  imgId: string;
  hash: string;
  ver: number;
  parent?: string; // parent asset id → version lineage
  status: "immutable" | "derived" | "approved" | "rejected";
  locale?: string;
  src?: string;
};

type Product = {
  sku: string;
  title: string;
  price: number;
  material: string;
  dimensions: string;
  variant: string;
  lock: "product-lock" | "creative";
  assetId: string;
  claimLocks: string[];
};

const TYPE_META: Record<AssetType, { label: string; tint: string }> = {
  original: { label: "original", tint: "bg-ink text-paper" },
  product: { label: "product", tint: "bg-indigo/15 text-indigo" },
  logo: { label: "logo", tint: "bg-leaf/15 text-leaf" },
  generated: { label: "generated", tint: "bg-marigold/20 text-saffron-deep" },
  approved: { label: "approved", tint: "bg-leaf text-paper" },
  export: { label: "export", tint: "bg-paper-deep text-ink-soft" },
};

const hash = (s: string) => "sha256:" + s.padEnd(6, "0").slice(0, 6) + "…";

const ASSETS: Asset[] = [
  {
    id: "a1",
    name: "kadam-sofa-source.jpg",
    type: "original",
    imgId: SAMPLE_IMAGES[0],
    hash: hash("kadam1"),
    ver: 1,
    status: "immutable",
  },
  {
    id: "a2",
    name: "kadam-sofa-scandi.png",
    type: "generated",
    imgId: SAMPLE_IMAGES[1],
    hash: hash("kadam2"),
    ver: 3,
    parent: "a1",
    status: "derived",
  },
  {
    id: "a3",
    name: "kadam-sofa-hero-approved.png",
    type: "approved",
    imgId: SAMPLE_IMAGES[2],
    hash: hash("kadam3"),
    ver: 3,
    parent: "a2",
    status: "approved",
  },
  {
    id: "a4",
    name: "kadam-sofa-1x1.jpg",
    type: "export",
    imgId: SAMPLE_IMAGES[2],
    hash: hash("kadam4"),
    ver: 1,
    parent: "a3",
    status: "derived",
    locale: "hi-IN",
  },
  {
    id: "a5",
    name: "diwali-dining-source.jpg",
    type: "original",
    imgId: SAMPLE_IMAGES[3],
    hash: hash("din1"),
    ver: 1,
    status: "immutable",
  },
  {
    id: "a6",
    name: "diwali-dining-lifestyle.png",
    type: "generated",
    imgId: SAMPLE_IMAGES[4],
    hash: hash("din2"),
    ver: 2,
    parent: "a5",
    status: "derived",
  },
  {
    id: "a7",
    name: "kosmic-logo-light.svg",
    type: "logo",
    imgId: SAMPLE_IMAGES[5],
    hash: hash("logo1"),
    ver: 1,
    status: "immutable",
  },
  {
    id: "a8",
    name: "oak-console-source.jpg",
    type: "original",
    imgId: SAMPLE_IMAGES[6],
    hash: hash("oak1"),
    ver: 1,
    status: "immutable",
  },
  {
    id: "a9",
    name: "oak-console-marble.png",
    type: "generated",
    imgId: SAMPLE_IMAGES[7],
    hash: hash("oak2"),
    ver: 1,
    parent: "a8",
    status: "rejected",
  },
];

const PRODUCTS: Product[] = [
  {
    sku: "KOS-SOF-114",
    title: "Kadam 3-seater sofa",
    price: 42990,
    material: "Teak + boucle",
    dimensions: "210×92×85 cm",
    variant: "Oat",
    lock: "product-lock",
    assetId: "a1",
    claimLocks: ["fabric colour", "leg finish", "seat count"],
  },
  {
    sku: "KOS-DIN-207",
    title: "Anokhi 6-seater dining set",
    price: 68500,
    material: "Sheesham wood",
    dimensions: "180×90×76 cm",
    variant: "Walnut",
    lock: "product-lock",
    assetId: "a5",
    claimLocks: ["wood grain", "chair count"],
  },
  {
    sku: "KOS-CON-051",
    title: "Oak media console",
    price: 24990,
    material: "Oak veneer",
    dimensions: "160×40×55 cm",
    variant: "Natural",
    lock: "creative",
    assetId: "a8",
    claimLocks: ["handle style"],
  },
];

const FILTERS: ("all" | AssetType)[] = [
  "all",
  "original",
  "product",
  "generated",
  "approved",
  "export",
  "logo",
];

function mapAssetType(value: unknown): AssetType {
  const type = String(value ?? "ORIGINAL").toLowerCase();
  if (type === "product") return "product";
  if (type === "logo") return "logo";
  if (type === "generated") return "generated";
  if (type === "approved") return "approved";
  if (type === "export") return "export";
  return "original";
}

function mapAssetStatus(value: unknown): Asset["status"] {
  const status = String(value ?? "READY").toUpperCase();
  if (status === "IMMUTABLE") return "immutable";
  if (status === "REJECTED" || status === "SOFT_DELETED") return "rejected";
  if (status === "APPROVED") return "approved";
  return "derived";
}

function mapServerAsset(row: Record<string, unknown>, index: number): Asset {
  return {
    id: String(row.id),
    name: String(row.name ?? "Untitled asset"),
    type: mapAssetType(row.type),
    imgId: SAMPLE_IMAGES[index % SAMPLE_IMAGES.length],
    hash: String(row.contentHash ?? "pending"),
    ver: 1,
    parent: typeof row.parentId === "string" ? row.parentId : undefined,
    status: mapAssetStatus(row.status),
    locale: typeof row.locale === "string" ? row.locale : undefined,
  };
}

function mapServerProduct(row: Record<string, unknown>): Product {
  const facts =
    row.facts && typeof row.facts === "object" && !Array.isArray(row.facts)
      ? (row.facts as Record<string, unknown>)
      : {};
  const claims = Array.isArray(row.claimRestrictions) ? row.claimRestrictions : [];
  const sourceAssetIds = Array.isArray(row.sourceAssetIds) ? row.sourceAssetIds : [];
  return {
    sku: String(row.sku ?? "—"),
    title: String(row.title ?? "Untitled product"),
    price: typeof row.priceMinor === "number" ? row.priceMinor / 100 : 0,
    material: String(row.material ?? facts.material ?? "—"),
    dimensions: String(row.dimensions ?? facts.dimensions ?? "—"),
    variant: String(row.variant ?? facts.variant ?? "—"),
    lock: row.lockMode === "CREATIVE" ? "creative" : "product-lock",
    assetId: String(sourceAssetIds[0] ?? ""),
    claimLocks: claims.filter((claim): claim is string => typeof claim === "string"),
  };
}

export default function AssetLibrary() {
  const { brand, backendEnabled, logAudit } = useStore();
  const [assets, setAssets] = useState<Asset[]>(backendEnabled ? [] : ASSETS);
  const [products, setProducts] = useState<Product[]>(backendEnabled ? [] : PRODUCTS);
  const [filter, setFilter] = useState<"all" | AssetType>("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Asset | null>(null);
  const [serverError, setServerError] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshServerLibrary = useCallback(async () => {
    if (!backendEnabled) return;
    const [serverAssets, serverProducts] = await Promise.all([
      getServerAssets(),
      getServerProducts(),
    ]);
    const mappedAssets = serverAssets
      .filter((asset) => asset.status !== "SOFT_DELETED")
      .map(mapServerAsset);
    const withDownloads = await Promise.all(
      mappedAssets.map(async (asset) => {
        try {
          const download = await getServerAssetDownload(asset.id);
          return { ...asset, src: download.url };
        } catch {
          return asset;
        }
      }),
    );
    setAssets(withDownloads);
    setProducts(serverProducts.map(mapServerProduct));
  }, [backendEnabled]);

  useEffect(() => {
    if (!backendEnabled) return;
    void refreshServerLibrary().catch((error) =>
      setServerError(
        error instanceof Error ? error.message : "The asset library could not be loaded.",
      ),
    );
  }, [backendEnabled, refreshServerLibrary]);

  const uploadAsset = async (file: File) => {
    if (!backendEnabled) {
      logAudit("selected asset upload", file.name);
      return;
    }
    setUploading(true);
    setServerError("");
    try {
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const contentHash = Array.from(new Uint8Array(digest))
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
      const intent = await createServerUploadIntent({
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        byteSize: file.size,
        contentHash,
        type: "ORIGINAL",
      });
      if (!intent.uploadUrl) {
        await refreshServerLibrary();
        logAudit("reused duplicate asset", file.name);
        return;
      }
      const uploadResponse = await fetch(intent.uploadUrl, {
        method: "PUT",
        headers: intent.headers,
        body: file,
      });
      if (!uploadResponse.ok) throw new Error(`Upload failed with HTTP ${uploadResponse.status}.`);
      await completeServerAsset(String(intent.asset.id));
      await refreshServerLibrary();
      logAudit("uploaded asset", file.name);
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "The asset upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const shown = assets.filter(
    (a) =>
      (filter === "all" || a.type === filter) && a.name.toLowerCase().includes(q.toLowerCase()),
  );

  const lineage = (a: Asset): Asset[] => {
    const chain: Asset[] = [a];
    let cur = a;
    while (cur.parent) {
      const p = assets.find((x) => x.id === cur.parent);
      if (!p) break;
      chain.unshift(p);
      cur = p;
    }
    return chain;
  };

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Added foundation · single source of truth"
        title="Asset library & catalogue"
        desc="Har product, logo, reference aur output yahin rehta hai — originals immutable, har transform ek nayi version banata hai. Batch aur product-lock isi catalogue se chalte hain, filenames se nahi."
        right={
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,audio/*,font/*,application/pdf,text/csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void uploadAsset(file);
              }}
            />
            <Btn variant="line" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
              {uploading ? "Uploading…" : "Upload asset"}
            </Btn>
          </>
        }
      />

      {serverError && <p className="font-mono text-[11px] text-saffron-deep">{serverError}</p>}

      <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
        <Stat
          label="Assets tracked"
          value={String(assets.length)}
          sub={`${brand.name} workspace`}
        />
        <Stat label="Catalogue SKUs" value={String(products.length)} sub="with lock mode" />
        <Stat
          label="Immutable originals"
          value={String(assets.filter((a) => a.status === "immutable").length)}
          sub="never overwritten"
        />
        <Stat
          label="Product-lock SKUs"
          value={String(products.filter((p) => p.lock === "product-lock").length)}
          sub="truth enforced"
        />
      </div>

      {/* catalogue */}
      <Panel title="Product catalogue · SKU schema with lock mode">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line font-mono text-[10px] uppercase tracking-[0.1em] text-ink-soft">
                <th className="px-5 py-3 text-left font-normal">SKU</th>
                <th className="px-5 py-3 text-left font-normal">Product</th>
                <th className="px-5 py-3 text-left font-normal">Facts</th>
                <th className="px-5 py-3 text-left font-normal">Locked claims</th>
                <th className="px-5 py-3 text-left font-normal">Mode</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.sku} className="border-b border-line last:border-0 align-top">
                  <td className="px-5 py-4 font-mono text-[12px] text-ink-soft">{p.sku}</td>
                  <td className="px-5 py-4">
                    <div className="font-medium">{p.title}</div>
                    <div className="font-mono text-[11px] text-saffron-deep">
                      ₹{p.price.toLocaleString("en-IN")}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-[12px] text-ink-soft">
                    {p.material}
                    <br />
                    {p.dimensions} · {p.variant}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-1">
                      {p.claimLocks.map((c) => (
                        <span
                          key={c}
                          className="rounded-full border border-line px-2 py-0.5 font-mono text-[9px] text-ink-soft"
                        >
                          🔒 {c}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${
                        p.lock === "product-lock"
                          ? "bg-indigo/15 text-indigo"
                          : "bg-marigold/20 text-saffron-deep"
                      }`}
                    >
                      {p.lock}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* asset grid */}
      <div>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors ${
                  filter === f
                    ? "bg-ink text-paper"
                    : "border border-line text-ink-soft hover:border-ink"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name…"
            className="ml-auto w-48 rounded-lg border border-line bg-paper px-3 py-1.5 text-sm outline-none focus:border-saffron-deep"
          />
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((a) => {
            const meta = TYPE_META[a.type];
            return (
              <button
                key={a.id}
                onClick={() => setSel(a)}
                className="group overflow-hidden rounded-2xl border border-line bg-card text-left transition-colors hover:border-saffron-deep"
              >
                <div className="relative aspect-[4/5] overflow-hidden">
                  {a.src ? (
                    <img src={a.src} alt={a.name} className="h-full w-full object-cover" />
                  ) : backendEnabled ? (
                    <div className="flex h-full items-center justify-center bg-paper-deep px-4 text-center font-mono text-[10px] text-ink-soft">
                      Preview unavailable until storage returns a signed URL.
                    </div>
                  ) : (
                    <img
                      src={img(a.imgId, 240, 300)}
                      alt={a.name}
                      className="h-full w-full object-cover"
                    />
                  )}
                  <span
                    className={`absolute left-2 top-2 rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide ${meta.tint}`}
                  >
                    {meta.label}
                  </span>
                  {a.status === "rejected" && (
                    <span className="absolute right-2 top-2 rounded-full bg-saffron-deep px-2 py-0.5 font-mono text-[9px] uppercase text-paper">
                      rejected
                    </span>
                  )}
                </div>
                <div className="px-3 py-2.5">
                  <div className="truncate text-[13px] font-medium">{a.name}</div>
                  <div className="mt-0.5 flex items-center justify-between font-mono text-[10px] text-ink-soft">
                    <span>v{a.ver}</span>
                    <span>{a.status === "immutable" ? "🔒 original" : `↳ ${a.parent ?? "—"}`}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        {shown.length === 0 && (
          <p className="mt-6 font-mono text-[12px] text-ink-soft">No assets match that filter.</p>
        )}
      </div>

      {/* detail drawer */}
      {sel && (
        <div className="fixed inset-0 z-50 flex justify-end bg-ink/30" onClick={() => setSel(null)}>
          <div
            className="h-full w-full max-w-md overflow-y-auto border-l border-line bg-paper p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">
                Asset detail
              </div>
              <button
                onClick={() => setSel(null)}
                className="font-mono text-sm text-ink-soft hover:text-ink"
              >
                ✕ close
              </button>
            </div>
            {sel.src ? (
              <img
                src={sel.src}
                alt={sel.name}
                className="mt-4 aspect-[4/5] w-full rounded-xl object-cover"
              />
            ) : backendEnabled ? (
              <div className="mt-4 flex aspect-[4/5] items-center justify-center rounded-xl border border-dashed border-line text-center font-mono text-[11px] text-ink-soft">
                Signed preview unavailable.
              </div>
            ) : (
              <img
                src={img(sel.imgId, 480, 600)}
                alt={sel.name}
                className="mt-4 aspect-[4/5] w-full rounded-xl object-cover"
              />
            )}
            <h2 className="mt-4 font-display text-xl font-medium">{sel.name}</h2>
            <dl className="mt-4 space-y-2 text-sm">
              {[
                ["Type", TYPE_META[sel.type].label],
                ["Version", `v${sel.ver}`],
                ["Content hash", sel.hash],
                ["Status", sel.status],
                ["Locale", sel.locale ?? "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-line pb-2">
                  <dt className="font-mono text-[11px] uppercase tracking-wide text-ink-soft">
                    {k}
                  </dt>
                  <dd className="font-mono text-[12px]">{v}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-6 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">
              Version lineage
            </div>
            <ol className="mt-3 space-y-2">
              {lineage(sel).map((a, i, arr) => (
                <li key={a.id} className="flex items-center gap-3">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full border font-mono text-[10px] ${
                      a.id === sel.id
                        ? "border-saffron-deep bg-saffron-deep text-paper"
                        : "border-line text-ink-soft"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span
                    className={`text-[13px] ${a.id === sel.id ? "font-medium" : "text-ink-soft"}`}
                  >
                    {a.name}
                  </span>
                  {i < arr.length - 1 && <span className="text-ink-soft">↓</span>}
                </li>
              ))}
            </ol>

            <div className="mt-6 flex gap-2">
              <Btn variant="line" className="flex-1">
                Restore source
              </Btn>
              <Btn variant="line" className="flex-1">
                Export
              </Btn>
            </div>
            <p className="mt-3 font-mono text-[10px] leading-relaxed text-ink-soft">
              Originals are immutable — every edit creates a new version. Delete supports
              soft-delete and export-before-purge.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
