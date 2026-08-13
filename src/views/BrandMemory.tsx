import { useState } from "react";
import { useStore } from "../store";
import { SAMPLE_IMAGES, img } from "../data";
import { PageHeader, Panel, Btn, PhaseTag } from "../ui";
import { saveServerBrand } from "../client/api";

export default function BrandMemory() {
  const { brand, setBrand, backendEnabled } = useStore();
  const [draft, setDraft] = useState(brand);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const dailyBase = draft.dailyPolicy ?? {
    postsPerWeek: 5,
    defaultMode: "APPROVAL" as const,
    allowedAutopublishTypes: ["evergreen_education"],
    blockedTypes: ["testimonial", "price_offer", "regulated_claim"],
    approvalSlaHours: 12,
  };
  const daily = {
    ...dailyBase,
    defaultMode: String(dailyBase.defaultMode).toUpperCase() as typeof dailyBase.defaultMode,
  };

  const dirty = JSON.stringify(draft) !== JSON.stringify(brand);

  const save = async () => {
    setError("");
    if (backendEnabled) {
      try {
        const result = await saveServerBrand({ name: draft.name, profile: draft });
        const next = {
          ...draft,
          ...(result.profile as Partial<typeof draft>),
          name: result.name,
          version: result.version,
        };
        setBrand(next);
        setDraft(next);
        setSaved(true);
        setTimeout(() => setSaved(false), 1800);
      } catch (reason) {
        setError(
          reason instanceof Error ? reason.message : "The brand profile could not be saved.",
        );
      }
      return;
    }
    const next = { ...draft, version: brand.version + 1 };
    setBrand(next);
    setDraft(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const toggleRef = (id: string) =>
    setDraft((d) => ({
      ...d,
      references: d.references.includes(id)
        ? d.references.filter((r) => r !== id)
        : [...d.references, id],
    }));

  const setColor = (i: number, v: string) =>
    setDraft((d) => ({
      ...d,
      colors: d.colors.map((c, idx) => (idx === i ? v : c)),
    }));

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Phase 1–2 · Persistent"
        title="Brand memory"
        desc="Har brand ka persistent profile — colours, tone, logo, reference images. Every generation across the platform reads from this so output stays on-brand without re-prompting."
        right={
          <div className="flex items-center gap-3">
            {saved && <span className="font-mono text-[11px] text-leaf">✓ Saved to memory</span>}
            <Btn disabled={!dirty} onClick={save}>
              Save profile
            </Btn>
          </div>
        }
      />

      {error && <p className="font-mono text-[11px] text-saffron-deep">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <Panel title="Identity">
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Brand name">
                <input
                  className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-saffron-deep"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </Field>
              <Field label="Vertical">
                <select
                  className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-saffron-deep"
                  value={draft.vertical}
                  onChange={(e) => setDraft({ ...draft, vertical: e.target.value })}
                >
                  {["Furniture", "Real estate", "Jewellery", "Tiles"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
              <Field label="Tagline">
                <input
                  className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-saffron-deep"
                  value={draft.tagline}
                  onChange={(e) => setDraft({ ...draft, tagline: e.target.value })}
                />
              </Field>
              <Field label="Primary language">
                <select
                  className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-saffron-deep"
                  value={draft.language}
                  onChange={(e) => setDraft({ ...draft, language: e.target.value })}
                >
                  {["Hinglish", "Hindi", "English", "Marathi", "Tamil"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Tone of voice">
                  <textarea
                    rows={3}
                    className="w-full resize-none rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-saffron-deep"
                    value={draft.tone}
                    onChange={(e) => setDraft({ ...draft, tone: e.target.value })}
                  />
                </Field>
              </div>
            </div>
          </Panel>

          <Panel title="Palette & type">
            <div className="flex flex-wrap items-end gap-5 p-5">
              {draft.colors.map((c, i) => (
                <label key={i} className="flex flex-col items-center gap-2">
                  <span
                    className="h-14 w-14 cursor-pointer rounded-xl border border-line shadow-sm"
                    style={{ background: c }}
                  >
                    <input
                      type="color"
                      value={c}
                      onChange={(e) => setColor(i, e.target.value)}
                      className="h-full w-full cursor-pointer opacity-0"
                    />
                  </span>
                  <span className="font-mono text-[10px] uppercase text-ink-soft">{c}</span>
                </label>
              ))}
              <div className="ml-auto">
                <Field label="Font pairing">
                  <input
                    className="w-44 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-saffron-deep"
                    value={draft.fonts}
                    onChange={(e) => setDraft({ ...draft, fonts: e.target.value })}
                  />
                </Field>
              </div>
            </div>
          </Panel>

          <Panel title={`Structured rules · profile v${draft.version}`}>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Audience">
                <input
                  className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-saffron-deep"
                  value={draft.audience}
                  onChange={(e) => setDraft({ ...draft, audience: e.target.value })}
                />
              </Field>
              <Field label="Locations">
                <input
                  className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-saffron-deep"
                  value={draft.locations.join(", ")}
                  onChange={(e) => setDraft({ ...draft, locations: splitList(e.target.value) })}
                />
              </Field>
              <Field label="Preferred words">
                <input
                  className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-saffron-deep"
                  value={draft.preferredWords.join(", ")}
                  onChange={(e) =>
                    setDraft({ ...draft, preferredWords: splitList(e.target.value) })
                  }
                />
              </Field>
              <Field label="Prohibited words / claims">
                <input
                  className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-saffron-deep"
                  value={draft.prohibitedWords.join(", ")}
                  onChange={(e) =>
                    setDraft({ ...draft, prohibitedWords: splitList(e.target.value) })
                  }
                />
              </Field>
              <Field label="Logo placement">
                <input
                  className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-saffron-deep"
                  value={draft.logoPlacement}
                  onChange={(e) => setDraft({ ...draft, logoPlacement: e.target.value })}
                />
              </Field>
              <Field label="Safe-area rule">
                <input
                  className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-saffron-deep"
                  value={draft.safeArea}
                  onChange={(e) => setDraft({ ...draft, safeArea: e.target.value })}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Product truth invariant">
                  <textarea
                    rows={2}
                    className="w-full resize-none rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-saffron-deep"
                    value={draft.productTruthRules}
                    onChange={(e) => setDraft({ ...draft, productTruthRules: e.target.value })}
                  />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm text-ink-soft sm:col-span-2">
                <input
                  type="checkbox"
                  checked={draft.disclosureRequired}
                  onChange={(e) => setDraft({ ...draft, disclosureRequired: e.target.checked })}
                  className="accent-saffron-deep"
                />
                Preserve AI-edited disclosure in review and export manifests
              </label>
            </div>
          </Panel>

          <Panel title="Daily Autopilot rules">
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Posts per week">
                <input
                  type="number"
                  min={1}
                  max={14}
                  className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-saffron-deep"
                  value={daily.postsPerWeek}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      dailyPolicy: {
                        ...daily,
                        postsPerWeek: Math.max(1, Math.min(14, Number(e.target.value) || 1)),
                      },
                    })
                  }
                />
              </Field>
              <Field label="Default mode">
                <select
                  className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-saffron-deep"
                  value={daily.defaultMode}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      dailyPolicy: {
                        ...daily,
                        defaultMode: e.target.value as typeof daily.defaultMode,
                      },
                    })
                  }
                >
                  <option value="APPROVAL">Approval</option>
                  <option value="DRAFT">Draft</option>
                  <option value="CAMPAIGN">Campaign</option>
                  <option value="GUARDED_AUTOPUBLISH">Guarded autopublish</option>
                </select>
              </Field>
              <Field label="Approval SLA hours">
                <input
                  type="number"
                  min={1}
                  max={168}
                  className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-saffron-deep"
                  value={daily.approvalSlaHours}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      dailyPolicy: {
                        ...daily,
                        approvalSlaHours: Math.max(1, Math.min(168, Number(e.target.value) || 12)),
                      },
                    })
                  }
                />
              </Field>
              <Field label="Content pillars">
                <input
                  className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-saffron-deep"
                  value={(draft.contentPillars ?? []).join(", ")}
                  onChange={(e) =>
                    setDraft({ ...draft, contentPillars: splitList(e.target.value) })
                  }
                />
              </Field>
              <Field label="Blocked content types">
                <input
                  className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-saffron-deep sm:col-span-2"
                  value={daily.blockedTypes.join(", ")}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      dailyPolicy: { ...daily, blockedTypes: splitList(e.target.value) },
                    })
                  }
                />
              </Field>
              <div className="rounded-lg border border-dashed border-line px-3 py-2 font-mono text-[11px] text-ink-soft sm:col-span-2">
                Locked layers stay deterministic:{" "}
                {draft.visualSystem?.lockedLayers?.join(", ") ?? "logo, product, price, disclosure"}
                . New offers, testimonials, prices and regulated claims remain human approval work.
              </div>
            </div>
          </Panel>

          <Panel
            title="Reference images"
            right={<PhaseTag phase={`${draft.references.length} selected`} />}
          >
            {backendEnabled ? (
              <div className="p-5 text-sm text-ink-soft">
                Upload and verify reference assets in Asset Library to attach them to this brand. No
                sample references are shown in server mode.
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2 p-5">
                {SAMPLE_IMAGES.map((id) => {
                  const on = draft.references.includes(id);
                  return (
                    <button
                      key={id}
                      onClick={() => toggleRef(id)}
                      className={`relative overflow-hidden rounded-lg border-2 transition-all ${
                        on
                          ? "border-saffron-deep"
                          : "border-transparent opacity-70 hover:opacity-100"
                      }`}
                    >
                      <img
                        src={img(id, 200, 200)}
                        alt="reference"
                        className="aspect-square w-full object-cover"
                      />
                      {on && (
                        <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-saffron-deep text-[11px] text-paper">
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>

        {/* live preview */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <Panel title="Memory card · live">
            <div className="p-5">
              <div
                className="overflow-hidden rounded-xl p-6 text-white"
                style={{ background: draft.colors[0] }}
              >
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] opacity-70">
                  {draft.vertical} · {draft.language}
                </div>
                <div className="mt-3 font-display text-2xl font-medium">{draft.name}</div>
                <div className="mt-1 text-sm opacity-80">{draft.tagline}</div>
                <div className="mt-4 flex gap-1.5">
                  {draft.colors.map((c) => (
                    <span key={c} className="h-6 flex-1 rounded" style={{ background: c }} />
                  ))}
                </div>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-ink-soft">{draft.tone}</p>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {draft.references.slice(0, 3).map((id) => (
                  <img
                    key={id}
                    src={img(id, 200, 200)}
                    alt="ref"
                    className="aspect-square rounded-lg object-cover"
                  />
                ))}
              </div>
              <div className="mt-5 rounded-lg border border-dashed border-line px-3 py-2 font-mono text-[11px] text-ink-soft">
                Injected into every prompt · read-only for Reviewer seats
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

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

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
