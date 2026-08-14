import { useEffect, useState } from "react";
import { useStore } from "../store";
import { SAMPLE_IMAGES, img } from "../data";
import { PageHeader, Panel, Btn, PhaseTag } from "../ui";
import {
  approveServerBrand,
  getServerAssetDownload,
  getServerAssets,
  saveServerBrand,
  testServerBrand,
} from "../client/api";

export default function BrandMemory() {
  const { brand, setBrand, backendEnabled } = useStore();
  const [draft, setDraft] = useState(brand);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [brandStatus, setBrandStatus] = useState(brand.approvalStatus ?? "DRAFT");
  const [brandTest, setBrandTest] = useState<Awaited<ReturnType<typeof testServerBrand>> | null>(
    null,
  );
  const [testing, setTesting] = useState(false);
  const [serverAssets, setServerAssets] = useState<Record<string, unknown>[]>([]);
  const [referenceUrls, setReferenceUrls] = useState<Record<string, string>>({});
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

  useEffect(() => {
    if (!backendEnabled) return;
    void getServerAssets()
      .then((assets) => setServerAssets(assets))
      .catch(() => setServerAssets([]));
  }, [backendEnabled]);

  useEffect(() => {
    if (!backendEnabled) return;
    const selected = draft.referenceAssetIds ?? [];
    void Promise.all(
      selected.slice(0, 10).map(async (id) => {
        try {
          return [id, (await getServerAssetDownload(id)).url] as const;
        } catch {
          return null;
        }
      }),
    ).then((entries) =>
      setReferenceUrls((current) => ({
        ...current,
        ...Object.fromEntries(
          entries.filter((entry): entry is readonly [string, string] => Boolean(entry)),
        ),
      })),
    );
  }, [backendEnabled, draft.referenceAssetIds]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(brand);

  const save = async () => {
    setError("");
    if (backendEnabled) {
      try {
        const result = await saveServerBrand({
          name: draft.name,
          profile: draft,
          referenceAssetIds: draft.referenceAssetIds ?? [],
        });
        const next = {
          ...draft,
          id: result.id,
          approvalStatus: "DRAFT",
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

  const approve = async () => {
    if (!brand.id) return;
    setError("");
    try {
      const result = await approveServerBrand(brand.id);
      setBrandStatus(String(result.approvalStatus ?? "APPROVED"));
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "The Brand Brain version could not be approved.",
      );
    }
  };

  const runBrandTest = async () => {
    if (!brand.id) return;
    setTesting(true);
    setError("");
    try {
      setBrandTest(await testServerBrand(brand.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The Brand Test could not run.");
    } finally {
      setTesting(false);
    }
  };

  const toggleRef = (id: string) =>
    setDraft((d) => ({
      ...d,
      referenceAssetIds: (d.referenceAssetIds ?? []).includes(id)
        ? (d.referenceAssetIds ?? []).filter((r) => r !== id)
        : [...(d.referenceAssetIds ?? []), id],
    }));

  const selectedReferenceIds = backendEnabled ? (draft.referenceAssetIds ?? []) : draft.references;

  const setColor = (i: number, v: string) =>
    setDraft((d) => ({
      ...d,
      colors: d.colors.map((c, idx) => (idx === i ? v : c)),
    }));

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Phase 1–2 · Persistent"
        title="Brand Brain"
        desc="A helpful creative director for your workspace: approved examples, avoid examples, product truth, tone, templates, and publishing policy in one versioned source of truth."
        right={
          <div className="flex items-center gap-3">
            {saved && <span className="font-mono text-[11px] text-leaf">✓ Saved to memory</span>}
            <Btn disabled={!dirty} onClick={save}>
              Save draft
            </Btn>
            {backendEnabled && brand.id && (
              <>
                <Btn variant="line" onClick={() => void runBrandTest()} disabled={testing}>
                  {testing ? "Testing…" : "Run Brand Test"}
                </Btn>
                <Btn variant="line" onClick={approve}>
                  Approve version
                </Btn>
              </>
            )}
          </div>
        }
      />

      {error && <p className="font-mono text-[11px] text-saffron-deep">{error}</p>}

      {backendEnabled && (
        <Panel title="Brand Brain readiness">
          <div className="grid gap-4 p-5 sm:grid-cols-3">
            <Readiness label="Current version" value={`v${draft.version}`} />
            <Readiness
              label="Status"
              value={brandStatus === "APPROVED" ? "Approved" : "Draft · not active"}
            />
            <Readiness label="Brand test" value="Preview rules before activation" />
          </div>
          <p className="border-t border-line px-5 py-3 text-sm text-ink-soft">
            A saved draft never changes published content. Approve the version after checking the
            summary and one test pack.
          </p>
        </Panel>
      )}

      {backendEnabled && (
        <Panel title="First-use intake · sources and trust examples">
          <div className="grid gap-4 p-5 sm:grid-cols-3">
            <Field label="Website">
              <input
                value={draft.website ?? ""}
                onChange={(event) => setDraft({ ...draft, website: event.target.value })}
                placeholder="https://brand.example"
                className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-saffron-deep"
              />
            </Field>
            <Field label="Instagram">
              <input
                value={draft.instagram ?? ""}
                onChange={(event) => setDraft({ ...draft, instagram: event.target.value })}
                placeholder="@brand"
                className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-saffron-deep"
              />
            </Field>
            <Field label="Drive / asset folder">
              <input
                value={draft.sourceFolder ?? ""}
                onChange={(event) => setDraft({ ...draft, sourceFolder: event.target.value })}
                placeholder="clients/brand/references"
                className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-saffron-deep"
              />
            </Field>
          </div>
          <p className="border-t border-line px-5 py-3 font-mono text-[10px] text-ink-soft">
            Add 5–10 approved examples and at least 3 avoid examples below. The server Brand Test
            explains what is still missing before activation.
          </p>
        </Panel>
      )}

      {brandTest && (
        <Panel title="Brand Test · activation evidence">
          <div className="space-y-4 p-5">
            <div
              className={`rounded-lg border px-4 py-3 ${brandTest.ready ? "border-leaf bg-leaf/8" : "border-saffron-deep bg-saffron-deep/5"}`}
            >
              <div className="text-sm font-medium">
                {brandTest.ready ? "Ready for activation" : "Needs input before activation"}
              </div>
              <p className="mt-1 text-sm text-ink-soft">{brandTest.summary}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {brandTest.checks.map((check) => (
                <div
                  key={check.label}
                  className="flex items-center gap-2 rounded border border-line px-3 py-2 font-mono text-[10px]"
                >
                  <span className={check.valid ? "text-leaf" : "text-saffron-deep"}>
                    {check.valid ? "✓" : "!"}
                  </span>
                  {check.label}
                </div>
              ))}
            </div>
            <p className="font-mono text-[10px] text-ink-soft">
              {brandTest.samplePack.explanation}
            </p>
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
              <div className="rounded-lg border border-line p-4">
                <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">
                  Sample campaign pack · {brandTest.samplePack.status.replace(/_/g, " ")}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {brandTest.samplePack.referenceAssetIds.slice(0, 3).map((id) => (
                    <div key={id} className="overflow-hidden rounded border border-line">
                      {referenceUrls[id] ? (
                        <img
                          src={referenceUrls[id]}
                          alt="approved reference"
                          className="aspect-square w-full object-cover"
                        />
                      ) : (
                        <div className="flex aspect-square items-center justify-center bg-paper-deep font-mono text-[9px] text-ink-soft">
                          verified reference
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {brandTest.samplePack.formats.map((format) => (
                    <span
                      key={format}
                      className="rounded-full border border-line px-2 py-1 font-mono text-[9px] text-ink-soft"
                    >
                      {format}
                    </span>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-line p-4">
                <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">
                  Copy & rules applied
                </div>
                <div className="mt-2 text-sm font-medium">
                  {brandTest.samplePack.content.headline}
                </div>
                <p className="mt-1 text-sm text-ink-soft">{brandTest.samplePack.content.caption}</p>
                <div className="mt-2 font-mono text-[10px] text-saffron-deep">
                  {brandTest.samplePack.content.cta}
                </div>
                <div className="mt-3 space-y-1">
                  {brandTest.samplePack.rulesApplied.map((rule) => (
                    <div key={rule} className="font-mono text-[10px] text-ink-soft">
                      · {rule}
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid gap-1">
                  {brandTest.samplePack.deliverables.map((item) => (
                    <div
                      key={item.type}
                      className="flex justify-between gap-2 rounded bg-paper-deep px-2 py-1 font-mono text-[9px]"
                    >
                      <span>{item.label}</span>
                      <span className={item.state === "ready" ? "text-leaf" : "text-saffron-deep"}>
                        {item.state}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Panel>
      )}

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

          <Panel title="Approved / avoid references">
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Approved examples or source IDs">
                <textarea
                  rows={3}
                  value={(draft.approvedExamples ?? []).join("\n")}
                  onChange={(event) =>
                    setDraft({ ...draft, approvedExamples: splitLines(event.target.value) })
                  }
                  className="w-full resize-none rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-saffron-deep"
                  placeholder="Posts that are genuinely us"
                />
              </Field>
              <Field label="Avoid examples or styles">
                <textarea
                  rows={3}
                  value={(draft.avoidExamples ?? []).join("\n")}
                  onChange={(event) =>
                    setDraft({ ...draft, avoidExamples: splitLines(event.target.value) })
                  }
                  className="w-full resize-none rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-saffron-deep"
                  placeholder="Never create this style"
                />
              </Field>
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
            right={<PhaseTag phase={`${selectedReferenceIds.length} selected`} />}
          >
            {backendEnabled ? (
              <div className="space-y-3 p-5">
                <p className="text-sm text-ink-soft">
                  Select 5–10 verified image assets. These IDs are persisted in the Brand Brain and
                  are required for production reference conditioning; unverified or quarantined
                  assets cannot be selected.
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {serverAssets
                    .filter((asset) => String(asset.mimeType ?? "").startsWith("image/"))
                    .slice(0, 40)
                    .map((asset) => {
                      const id = String(asset.id);
                      const on = selectedReferenceIds.includes(id);
                      const ready = ["READY", "IMMUTABLE", "DERIVED"].includes(
                        String(asset.status),
                      );
                      return (
                        <button
                          key={id}
                          disabled={!ready}
                          onClick={() => toggleRef(id)}
                          className={`relative overflow-hidden rounded-lg border-2 text-left ${
                            on ? "border-saffron-deep" : "border-transparent"
                          } ${ready ? "" : "opacity-40"}`}
                        >
                          {referenceUrls[id] ? (
                            <img
                              src={referenceUrls[id]}
                              alt={String(asset.name ?? "reference")}
                              className="aspect-square w-full object-cover"
                            />
                          ) : (
                            <div className="flex aspect-square items-center justify-center bg-paper-deep p-2 text-center font-mono text-[9px] text-ink-soft">
                              {String(asset.name ?? id).slice(0, 28)}
                            </div>
                          )}
                          <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-1.5 py-1 font-mono text-[8px] text-white">
                            {ready ? String(asset.status).toLowerCase() : "verify first"}
                          </span>
                          {on && (
                            <span className="absolute right-1 top-1 rounded-full bg-saffron-deep px-1.5 py-0.5 text-[10px] text-paper">
                              ✓
                            </span>
                          )}
                        </button>
                      );
                    })}
                </div>
                {!serverAssets.some((asset) =>
                  String(asset.mimeType ?? "").startsWith("image/"),
                ) && (
                  <p className="rounded-lg border border-dashed border-line px-3 py-3 font-mono text-[10px] text-saffron-deep">
                    No image assets are available. Upload and complete Asset Library verification
                    first.
                  </p>
                )}
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
                {selectedReferenceIds.slice(0, 3).map((id) =>
                  backendEnabled ? (
                    referenceUrls[id] ? (
                      <img
                        key={id}
                        src={referenceUrls[id]}
                        alt="ref"
                        className="aspect-square rounded-lg object-cover"
                      />
                    ) : (
                      <div
                        key={id}
                        className="flex aspect-square items-center justify-center rounded-lg border border-line bg-paper-deep font-mono text-[9px] text-ink-soft"
                      >
                        asset pending
                      </div>
                    )
                  ) : (
                    <img
                      key={id}
                      src={img(id, 200, 200)}
                      alt="ref"
                      className="aspect-square rounded-lg object-cover"
                    />
                  ),
                )}
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

function splitLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function Readiness({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-paper px-3 py-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-soft">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}
