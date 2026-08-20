import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { PageHeader, Panel, Btn, Stat } from "../ui";
import { useStore } from "../store";
import { SAMPLE_IMAGES, img } from "../data";
import { getServerMarketplacePackages, installServerMarketplacePackage } from "../client/api";

/* ── vertical packs (blueprint §12 Phase 5) ── */
type Pack = {
  id: string;
  name: string;
  templates: number;
  nodes: number;
  img: number;
  blurb: string;
  accent: string;
};
const PACKS: Pack[] = [
  {
    id: "furniture",
    name: "Furniture & décor",
    templates: 18,
    nodes: 9,
    img: 0,
    blurb: "Room-scale lifestyle, material macros, scale-in-context, festive sets.",
    accent: "#a6410a",
  },
  {
    id: "jewellery",
    name: "Jewellery",
    templates: 14,
    nodes: 7,
    img: 6,
    blurb: "Macro sparkle, on-model try-on, gift framing, purity/claim guardrails.",
    accent: "#e79a1f",
  },
  {
    id: "realestate",
    name: "Real estate",
    templates: 11,
    nodes: 8,
    img: 2,
    blurb: "Staged interiors, day-to-dusk, amenity boards, RERA-safe claim locks.",
    accent: "#2e3a6e",
  },
  {
    id: "tiles",
    name: "Tiles & surfaces",
    templates: 9,
    nodes: 6,
    img: 4,
    blurb: "Pattern tiling, room application, finish comparison, spec overlays.",
    accent: "#4a6b3f",
  },
];

/* ── template / agent marketplace ── */
type Listing = {
  id: string;
  name: string;
  author: string;
  kind: "template" | "agent";
  version: string;
  compatible: boolean;
  rating: number;
  installs: number;
  moderation: "verified" | "in-review";
  price: string;
};
const LISTINGS: Listing[] = [
  {
    id: "m1",
    name: "POV UGC hook engine",
    author: "Studio Marg",
    kind: "agent",
    version: "v3.1",
    compatible: true,
    rating: 4.8,
    installs: 1240,
    moderation: "verified",
    price: "Free",
  },
  {
    id: "m2",
    name: "Festive furniture set · Diwali",
    author: "Kosmic Labs",
    kind: "template",
    version: "v2.0",
    compatible: true,
    rating: 4.6,
    installs: 860,
    moderation: "verified",
    price: "120 cr",
  },
  {
    id: "m3",
    name: "Jewellery macro + claim-lock",
    author: "diamanto.in",
    kind: "template",
    version: "v1.4",
    compatible: true,
    rating: 4.9,
    installs: 540,
    moderation: "verified",
    price: "90 cr",
  },
  {
    id: "m4",
    name: "Real-estate dusk relight",
    author: "Realzentic",
    kind: "agent",
    version: "v0.9",
    compatible: false,
    rating: 4.2,
    installs: 210,
    moderation: "in-review",
    price: "Free",
  },
];

export default function Marketplace() {
  const { logAudit, backendEnabled } = useStore();
  const [tab, setTab] = useState<"packs" | "market">("packs");
  const [installed, setInstalled] = useState<Record<string, boolean>>(
    backendEnabled ? {} : { furniture: true },
  );
  const [serverPackages, setServerPackages] = useState<Array<Record<string, unknown>>>([]);
  const [serverError, setServerError] = useState("");
  const [installing, setInstalling] = useState("");

  useEffect(() => {
    if (!backendEnabled) return;
    void getServerMarketplacePackages()
      .then((packages) => setServerPackages(packages))
      .catch((error) =>
        setServerError(error instanceof Error ? error.message : "Marketplace could not be loaded."),
      );
  }, [backendEnabled]);

  const install = (id: string, label: string) => {
    setInstalled((s) => ({ ...s, [id]: true }));
    logAudit("installed from marketplace", label);
  };

  const installServerPackage = async (id: string, label: string) => {
    setInstalling(id);
    try {
      await installServerMarketplacePackage(id, label);
      setInstalled((state) => ({ ...state, [id]: true }));
      logAudit("installed marketplace package", label);
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Package installation failed.");
    } finally {
      setInstalling("");
    }
  };

  const marketListings: Listing[] = backendEnabled
    ? serverPackages.map((pkg) => {
        const count = (pkg._count ?? {}) as Record<string, unknown>;
        const status = String(pkg.status ?? "DRAFT");
        return {
          id: String(pkg.id),
          name: String(pkg.name ?? "Untitled package"),
          author: "Workspace package",
          kind: "template",
          version: `v${String(pkg.version ?? 1)}`,
          compatible: status === "PUBLISHED",
          rating: 0,
          installs: Number(count.installs ?? 0),
          moderation: status === "PUBLISHED" ? "verified" : "in-review",
          price: "Included",
        };
      })
    : serverPackages.length > 0
      ? serverPackages.map((pkg) => {
          const count = (pkg._count ?? {}) as Record<string, unknown>;
          const status = String(pkg.status ?? "DRAFT");
          return {
            id: String(pkg.id),
            name: String(pkg.name ?? "Untitled package"),
            author: "Workspace package",
            kind: "template",
            version: `v${String(pkg.version ?? 1)}`,
            compatible: status === "PUBLISHED",
            rating: 0,
            installs: Number(count.installs ?? 0),
            moderation: status === "PUBLISHED" ? "verified" : "in-review",
            price: "Included",
          };
        })
      : LISTINGS;

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Phase 5 · Marketplace & packs"
        title="Marketplace & vertical packs"
        desc="Proven workflows aur templates share karo — moderation aur version-compatibility ke saath. Vertical packs (furniture, jewellery, real-estate, tiles) har industry ke liye ready-made templates, nodes aur claim-guardrails laate hain, taaki naya customer pehle din se production-ready ho."
        right={
          <div className="flex items-center gap-1 rounded-full border border-line bg-card p-1">
            {(["packs", "market"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-full px-4 py-1.5 font-mono text-[11px] uppercase tracking-wide transition-colors ${
                  tab === t ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"
                }`}
              >
                {t === "packs" ? "Vertical packs" : "Marketplace"}
              </button>
            ))}
          </div>
        }
      />

      {serverError && <p className="font-mono text-[11px] text-saffron-deep">{serverError}</p>}

      <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
        <Stat
          label="Vertical packs"
          value={backendEnabled ? "—" : "4"}
          sub={
            backendEnabled ? "configured packages only" : "furniture · jewellery · realty · tiles"
          }
        />
        <Stat
          label="Listings"
          value={
            backendEnabled
              ? String(serverPackages.length)
              : serverPackages.length > 0
                ? String(serverPackages.length)
                : "52"
          }
          sub="templates + agents"
        />
        <Stat
          label="Moderated"
          value={backendEnabled ? "—" : "100%"}
          sub={backendEnabled ? "provider status required" : "version-compat checked"}
        />
        <Stat
          label="Installed"
          value={String(Object.values(installed).filter(Boolean).length)}
          sub="in this workspace"
        />
      </div>

      {tab === "packs" ? (
        backendEnabled ? (
          <Panel title="Vertical packs">
            <div className="p-5 text-sm text-ink-soft">
              No server-published vertical packs are available yet. Install a moderated package
              after it appears in the marketplace feed.
            </div>
          </Panel>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {PACKS.map((p) => (
              <div key={p.id} className="overflow-hidden rounded-2xl border border-line bg-card">
                <div className="relative h-32">
                  <img
                    src={img(SAMPLE_IMAGES[p.img], 600, 200)}
                    alt={p.name}
                    className="h-full w-full bg-paper-deep object-cover"
                  />
                  <div
                    className="absolute inset-0"
                    style={{ background: `linear-gradient(90deg, ${p.accent}dd, transparent)` }}
                  />
                  <div className="absolute bottom-3 left-4">
                    <div className="font-display text-2xl font-medium text-paper">{p.name}</div>
                    <div className="font-mono text-[10px] uppercase tracking-wide text-paper/80">
                      {p.templates} templates · {p.nodes} nodes
                    </div>
                  </div>
                </div>
                <div className="p-5">
                  <p className="text-sm leading-relaxed text-ink-soft">{p.blurb}</p>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-wide text-leaf">
                      ✓ claim-guardrails included
                    </span>
                    <Btn
                      variant={installed[p.id] ? "ghost" : "solid"}
                      disabled={installed[p.id]}
                      onClick={() => install(p.id, `${p.name} pack`)}
                    >
                      {installed[p.id] ? "✓ Installed" : "Install pack"}
                    </Btn>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <Panel
          title="Templates & agents"
          right={
            <span className="font-mono text-[11px] text-ink-soft">
              moderated · version-compatible
            </span>
          }
        >
          <div className="divide-y divide-line">
            {marketListings.map((l) => (
              <div
                key={l.id}
                className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-paper-deep text-lg">
                    {l.kind === "agent" ? "✦" : "▦"}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{l.name}</span>
                      <span className="rounded-full border border-line px-1.5 py-0.5 font-mono text-[9px] uppercase text-ink-soft">
                        {l.kind}
                      </span>
                      <span className="font-mono text-[10px] text-ink-soft">{l.version}</span>
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-ink-soft">
                      by {l.author} · ★ {l.rating} · {l.installs.toLocaleString("en-IN")} installs
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide ${
                      l.moderation === "verified" ? "bg-leaf text-paper" : "bg-marigold text-ink"
                    }`}
                  >
                    {l.moderation}
                  </span>
                  {!l.compatible ? (
                    <span className="font-mono text-[10px] text-saffron-deep">
                      needs engine ≥ v4
                    </span>
                  ) : (
                    <span className="font-mono text-[12px] font-medium">{l.price}</span>
                  )}
                  <Btn
                    variant={installed[l.id] ? "ghost" : "line"}
                    disabled={installed[l.id] || !l.compatible || installing === l.id}
                    onClick={() =>
                      serverPackages.some((pkg) => String(pkg.id) === l.id)
                        ? void installServerPackage(l.id, `${l.name} ${l.version}`)
                        : install(l.id, `${l.name} ${l.version}`)
                    }
                  >
                    {installing === l.id
                      ? "Installing…"
                      : installed[l.id]
                        ? "✓ Added"
                        : l.compatible
                          ? "Install"
                          : "Incompatible"}
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-line bg-ink px-6 py-6 text-paper sm:flex-row lg:px-10"
      >
        <div>
          <div className="font-display text-xl font-medium">Publish your own workflow.</div>
          <div className="mt-1 font-mono text-[11px] text-paper/60">
            Private sharing → moderated public listing. You keep version control and revenue share.
          </div>
        </div>
        <Btn onClick={() => logAudit("opened publish-to-marketplace", "new listing draft")}>
          Submit a listing →
        </Btn>
      </motion.div>
    </div>
  );
}
