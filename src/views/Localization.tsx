import { useEffect, useState } from "react";
import { PageHeader, Panel, Btn } from "../ui";
import { useStore } from "../store";
import { SAMPLE_IMAGES, img } from "../data";
import { createServerLocalization, getServerLocalizationJob, getServerState } from "../client/api";
import { uid } from "../domain";

type Locale = {
  code: string;
  label: string;
  script: string;
  currency: string;
  formality: string;
  on: boolean;
};

const LOCALES: Locale[] = [
  {
    code: "hi-IN",
    label: "Hindi",
    script: "Devanagari",
    currency: "₹ / INR",
    formality: "Aap (respectful)",
    on: true,
  },
  {
    code: "en-IN",
    label: "Hinglish",
    script: "Latin",
    currency: "₹ / INR",
    formality: "Casual",
    on: true,
  },
  {
    code: "ta-IN",
    label: "Tamil",
    script: "Tamil",
    currency: "₹ / INR",
    formality: "Neutral",
    on: true,
  },
  {
    code: "mr-IN",
    label: "Marathi",
    script: "Devanagari",
    currency: "₹ / INR",
    formality: "Neutral",
    on: false,
  },
  {
    code: "ar-AE",
    label: "Arabic (UAE)",
    script: "Arabic · RTL",
    currency: "AED",
    formality: "Formal",
    on: false,
  },
];

// glossary / locked terms — must never be translated
const GLOSSARY = [
  { term: "Kosmic Furniture", rule: "Brand name — never translate" },
  { term: "KOS-SOF-114", rule: "SKU — never translate" },
  { term: "₹42,990", rule: "Price — locale-format only, value locked" },
  { term: "Teak", rule: "Material claim — approved translations only" },
];

// per-locale headline preview (source is immutable)
const SOURCE = "Monsoon Sale — 30% off the Kadam sofa";
const TRANSLATIONS: Record<string, { headline: string; cta: string; warn?: string }> = {
  "hi-IN": { headline: "मॉनसून सेल — कदम सोफ़े पर 30% की छूट", cta: "व्हाट्सएप पर ख़रीदें" },
  "en-IN": { headline: "Monsoon Sale — Kadam sofa pe 30% off!", cta: "WhatsApp pe order karo" },
  "ta-IN": {
    headline: "மழைக்கால சலுகை — கடம் சோஃபாவில் 30% தள்ளுபடி",
    cta: "WhatsApp-ல் வாங்குங்கள்",
    warn: "Headline +18% length — reflow to 2 lines",
  },
  "mr-IN": { headline: "मॉन्सून सेल — कदम सोफ्यावर 30% सूट", cta: "व्हॉट्सअॅपवर खरेदी करा" },
  "ar-AE": {
    headline: "تخفيضات الموسم — خصم 30٪ على أريكة كادم",
    cta: "اطلب عبر واتساب",
    warn: "RTL layout — mirror safe-area & CTA",
  },
};

export default function Localization() {
  const { brand, logAudit, backendEnabled } = useStore();
  const [locales, setLocales] = useState(LOCALES);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [sourceOutputId, setSourceOutputId] = useState<string | undefined>();
  const [sourceText, setSourceText] = useState(backendEnabled ? "" : SOURCE);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<Record<string, unknown> | null>(null);
  const [lockedTermInput, setLockedTermInput] = useState(brand.name);
  const active = locales.filter((l) => l.on);
  const activeLockedTerms = lockedTermInput
    .split(",")
    .map((term) => term.trim())
    .filter(Boolean);

  const toggle = (code: string) =>
    setLocales((ls) => ls.map((l) => (l.code === code ? { ...l, on: !l.on } : l)));

  const generate = async () => {
    setError("");
    if (backendEnabled) {
      if (!sourceOutputId || !sourceText) {
        setError("Approve a server creative before creating localized variants.");
        return;
      }
      setRunning(true);
      try {
        const result = await createServerLocalization({
          sourceOutputId,
          sourceText,
          sourceCta: "Shop on WhatsApp",
          locales: active.map((locale) => locale.code),
          lockedTerms: activeLockedTerms,
          idempotencyKey: uid("localization"),
        });
        const createdJob = result.job;
        setJob(createdJob);
        setJobId(String(createdJob.id ?? ""));
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Localization could not be started.");
      } finally {
        setRunning(false);
      }
      return;
    }
    logAudit("localized campaign", `Monsoon Sale · ${active.length} locales`);
  };

  useEffect(() => {
    if (!backendEnabled || !jobId) return;
    let active = true;
    const poll = async () => {
      try {
        const current = await getServerLocalizationJob(jobId);
        if (!active) return;
        setJob(current);
        const status = String(current.status ?? "");
        if (!["READY_FOR_REVIEW", "FAILED", "COMPLETED"].includes(status))
          window.setTimeout(() => void poll(), 1500);
      } catch (reason) {
        if (active)
          setError(reason instanceof Error ? reason.message : "Localization status failed.");
      }
    };
    void poll();
    return () => {
      active = false;
    };
  }, [backendEnabled, jobId]);

  useEffect(() => {
    if (!backendEnabled) return;
    void getServerState()
      .then((state) => {
        const runs = state.runs as Array<Record<string, unknown>>;
        for (const run of runs) {
          const outputs = Array.isArray(run.outputs) ? run.outputs : [];
          const approved = outputs.find(
            (output) =>
              output &&
              typeof output === "object" &&
              ["APPROVED", "EXPORTED"].includes(String((output as Record<string, unknown>).status)),
          ) as Record<string, unknown> | undefined;
          if (approved) {
            setSourceOutputId(String(approved.id));
            setSourceText(String(approved.name ?? "Approved campaign creative"));
            return;
          }
        }
      })
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : "Approved source lookup failed."),
      );
  }, [backendEnabled]);

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Phase 3 · Distribution"
        title="One-click localization"
        desc="Ek approved campaign → Hindi, Hinglish aur baaki markets, bina har asset dobara banaye. Source immutable rehta hai; locked terms (brand, SKU, price, claims) kabhi galti se translate nahi hote; layout locale ke hisaab se reflow hota hai."
        right={
          <Btn onClick={() => void generate()} disabled={running}>
            {running ? "Generating…" : `Generate ${active.length} locales`}
          </Btn>
        }
      />

      {error && <p className="font-mono text-[11px] text-saffron-deep">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-6">
          <Panel title="Locale profiles">
            <div>
              {locales.map((l) => (
                <label
                  key={l.code}
                  className="flex cursor-pointer items-center gap-3 border-b border-line px-4 py-3 last:border-0 hover:bg-paper-deep/50"
                >
                  <input
                    type="checkbox"
                    checked={l.on}
                    onChange={() => toggle(l.code)}
                    className="h-4 w-4 accent-saffron-deep"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {l.label}
                      <span className="font-mono text-[10px] text-ink-soft">{l.code}</span>
                    </div>
                    <div className="font-mono text-[10px] text-ink-soft">
                      {l.script} · {l.currency} · {l.formality}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </Panel>

          <Panel title="Glossary · locked terms">
            <div className="space-y-2 p-4">
              {backendEnabled ? (
                <label className="block">
                  <span className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink-soft">
                    Brand / SKU / price / approved claims · comma separated
                  </span>
                  <input
                    value={lockedTermInput}
                    onChange={(event) => setLockedTermInput(event.target.value)}
                    className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm"
                  />
                  <span className="mt-2 block font-mono text-[10px] text-ink-soft">
                    These are sent as immutable terms to the server localization job.
                  </span>
                </label>
              ) : (
                GLOSSARY.map((g) => (
                  <div key={g.term} className="rounded-lg border border-line px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium">🔒 {g.term}</span>
                    </div>
                    <div className="font-mono text-[10px] text-ink-soft">{g.rule}</div>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Source · immutable">
            <div className="flex items-center gap-4 p-5">
              {backendEnabled ? (
                <div className="flex h-20 w-28 shrink-0 items-center justify-center rounded-lg border border-dashed border-line text-center font-mono text-[10px] text-ink-soft">
                  Backend source asset
                </div>
              ) : (
                <img
                  src={img(SAMPLE_IMAGES[0], 160, 120)}
                  alt="source creative"
                  className="h-20 w-28 shrink-0 rounded-lg object-cover"
                />
              )}
              <div>
                <div className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">
                  en · master
                </div>
                <div className="mt-1 font-display text-lg font-medium">
                  {backendEnabled ? sourceText || "No approved server creative selected" : SOURCE}
                </div>
                <div className="font-mono text-[11px] text-ink-soft">CTA: Shop on WhatsApp</div>
              </div>
            </div>
          </Panel>

          <Panel title={`Locale variants · ${active.length}`}>
            <div className="grid gap-px bg-line sm:grid-cols-2">
              {backendEnabled ? (
                Array.isArray(job?.variants) && job.variants.length ? (
                  (job.variants as Array<Record<string, unknown>>).map((variant) => (
                    <div key={String(variant.id ?? variant.locale)} className="bg-card p-5">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="font-mono text-[10px] uppercase tracking-wide text-saffron-deep">
                          {String(variant.locale)}
                        </span>
                        <span className="font-mono text-[10px] uppercase text-ink-soft">
                          {String(variant.status ?? "PENDING")}
                        </span>
                      </div>
                      <div className="font-display text-base font-medium leading-snug">
                        {String(variant.headline ?? "Waiting for provider output…")}
                      </div>
                      <div className="mt-1 font-mono text-[11px] text-ink-soft">
                        {String(variant.cta ?? "—")}
                      </div>
                      {Array.isArray(variant.warnings) && variant.warnings.length > 0 && (
                        <div className="mt-2 font-mono text-[10px] text-saffron-deep">
                          {(variant.warnings as unknown[]).map(String).join(" · ")}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="bg-card p-5 text-sm text-ink-soft">
                    Start a server localization job to receive provider-backed variants and layout
                    QA evidence.
                  </div>
                )
              ) : (
                active.map((l) => {
                  const t = TRANSLATIONS[l.code];
                  const rtl = l.script.includes("RTL");
                  return (
                    <div key={l.code} className="bg-card p-5">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="font-mono text-[10px] uppercase tracking-wide text-saffron-deep">
                          {l.label} · {l.code}
                        </span>
                        {t?.warn ? (
                          <span className="rounded-full bg-marigold/20 px-2 py-0.5 font-mono text-[9px] uppercase text-saffron-deep">
                            reflow
                          </span>
                        ) : (
                          <span className="rounded-full bg-leaf/15 px-2 py-0.5 font-mono text-[9px] uppercase text-leaf">
                            layout ok
                          </span>
                        )}
                      </div>
                      <div
                        className={`font-display text-base font-medium leading-snug ${rtl ? "text-right" : ""}`}
                        dir={rtl ? "rtl" : "ltr"}
                      >
                        {t?.headline}
                      </div>
                      <div
                        className={`mt-1 font-mono text-[11px] text-ink-soft ${rtl ? "text-right" : ""}`}
                        dir={rtl ? "rtl" : "ltr"}
                      >
                        {t?.cta} →
                      </div>
                      {t?.warn && (
                        <div className="mt-2 font-mono text-[10px] text-saffron-deep">
                          → {t.warn}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            {backendEnabled && job && (
              <div className="border-t border-line px-5 py-3 font-mono text-[11px] text-ink-soft">
                Job {String(job.id)} · {String(job.status)} · locked terms are checked before any
                render.
              </div>
            )}
            <div className="border-t border-line px-5 py-3 font-mono text-[11px] text-ink-soft">
              Every locale is reviewed against the source before export · locked terms verified
              unchanged · disclaimers re-checked per market.
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
