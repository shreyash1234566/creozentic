import { useEffect, useRef, useState } from "react";
import { PageHeader, Panel, Btn } from "../ui";
import { useStore } from "../store";
import { SAMPLE_IMAGES, USD_INR, img } from "../data";
import {
  analyzeServerUGCProject,
  createServerUGCProject,
  getServerAssetDownload,
  getServerCampaigns,
  getServerState,
  planServerUGCProject,
  renderServerUGCProject,
  updateServerUGCShot,
} from "../client/api";
import { uid } from "../domain";
import ScoreCard, { DIMENSIONS, type ScoreRow, type Verdict, hasCritical } from "./ScoreCard";

type Stage = "brief" | "assemble" | "export";
type Shot = {
  id: string;
  label: string;
  imgId: string;
  dur: number;
  kind: "hook" | "body" | "cta";
  caption: string;
};

const HOOKS: Record<string, string> = {
  A: '"Ghar sajaana ab itna aasaan?"',
  B: '"3 second mein pyaar ho jaayega 🛋️"',
};

const BASE_SHOTS: Shot[] = [
  {
    id: "s1",
    label: "Hook · talking head",
    imgId: SAMPLE_IMAGES[3],
    dur: 3,
    kind: "hook",
    caption: "POV: naya sofa aa gaya",
  },
  {
    id: "s2",
    label: "Product reveal",
    imgId: SAMPLE_IMAGES[0],
    dur: 4,
    kind: "body",
    caption: "Kadam 3-seater · teak + boucle",
  },
  {
    id: "s3",
    label: "Lifestyle b-roll",
    imgId: SAMPLE_IMAGES[1],
    dur: 4,
    kind: "body",
    caption: "Chai, dhoop, aur comfort",
  },
  {
    id: "s4",
    label: "Detail macro",
    imgId: SAMPLE_IMAGES[6],
    dur: 3,
    kind: "body",
    caption: "Hand-finished stitching",
  },
  {
    id: "s5",
    label: "CTA card",
    imgId: SAMPLE_IMAGES[2],
    dur: 3,
    kind: "cta",
    caption: "Order on WhatsApp →",
  },
];

const KIND_TINT: Record<Shot["kind"], string> = {
  hook: "bg-saffron-deep text-paper",
  body: "bg-indigo/15 text-indigo",
  cta: "bg-leaf text-paper",
};

// Local-only fallback for the demo workspace. Backend mode reads the server-computed evidence
// attached to the campaign review task after rendering.
const buildVerdicts = (
  repaired: boolean,
): Record<string, { verdict: Verdict; repair?: string }> => ({
  "Product / identity truth": { verdict: "pass" },
  "Brand rules & typography": { verdict: "pass" },
  "Message / claim correctness": { verdict: "pass" },
  "Composition & platform fit": { verdict: "pass" },
  "Temporal / audio quality": repaired
    ? { verdict: "pass" }
    : {
        verdict: "critical",
        repair: "Lip-sync drift on shot 1 at 00:02 — re-render with audio re-align",
      },
  "Distinctiveness / authenticity": { verdict: "pass" },
  "Technical export / rights": {
    verdict: "warn",
    repair: "Add AI-edit + synthetic-voice disclosure to manifest",
  },
});

export default function VideoStudio() {
  const { brand, spend, logAudit, backendEnabled } = useStore();
  const [stage, setStage] = useState<Stage>("brief");
  const [hook, setHook] = useState<"A" | "B">("A");
  const [shots, setShots] = useState<Shot[]>(
    backendEnabled ? BASE_SHOTS.map((shot) => ({ ...shot, imgId: "" })) : BASE_SHOTS,
  );
  const [consent, setConsent] = useState({ face: true, voice: false });
  const [consentSubject, setConsentSubject] = useState("");
  const [bRollAssetIds, setBRollAssetIds] = useState<string[]>([]);
  const [musicAssetId, setMusicAssetId] = useState("");
  const [coverShotId, setCoverShotId] = useState("s1");
  const [upscale, setUpscale] = useState(true);
  const [repaired, setRepaired] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [serverAssets, setServerAssets] = useState<
    Awaited<ReturnType<typeof getServerState>>["assets"]
  >([]);
  const [serverJobId, setServerJobId] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<Array<Record<string, unknown>>>([]);
  const [campaignId, setCampaignId] = useState("");
  const [serverPreviewUrl, setServerPreviewUrl] = useState<string | null>(null);
  const [serverMediaJob, setServerMediaJob] = useState<Record<string, unknown> | null>(null);
  const [serverQualityScores, setServerQualityScores] = useState<Record<string, unknown> | null>(
    null,
  );
  const [serverReviewTaskId, setServerReviewTaskId] = useState<string | null>(null);
  const [lockedShotIds, setLockedShotIds] = useState<string[]>([]);
  const [serverError, setServerError] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!backendEnabled) return;
    void getServerState()
      .then((state) => {
        const assets = state.assets.filter((asset) => asset.status !== "SOFT_DELETED");
        setServerAssets(assets);
        const video = assets.find((asset) => asset.mimeType.startsWith("video/"));
        if (video)
          void getServerAssetDownload(video.id).then((download) =>
            setServerPreviewUrl(download.url),
          );
      })
      .catch((error) =>
        setServerError(
          error instanceof Error ? error.message : "Server assets could not be loaded.",
        ),
      );
    void getServerCampaigns()
      .then((items) => {
        setCampaigns(items);
        if (!campaignId && items[0]?.id) setCampaignId(String(items[0].id));
      })
      .catch(() => setCampaigns([]));
  }, [backendEnabled, campaignId]);

  const total = shots.reduce((s, x) => s + x.dur, 0);
  const rows: ScoreRow[] = DIMENSIONS.map((d) => {
    const serverVerdict = serverQualityScores?.[d.dim];
    const v =
      backendEnabled && serverVerdict && typeof serverVerdict === "object"
        ? (serverVerdict as { verdict?: Verdict; repair?: string })
        : backendEnabled
          ? { verdict: "pass" as Verdict }
          : buildVerdicts(repaired)[d.dim];
    return { ...d, verdict: v?.verdict ?? "pass", repair: v?.repair };
  });
  const blocked = hasCritical(rows);

  // video cost class is separate + higher than image (blueprint §A5)
  const rawUsd = 0.42 * shots.length + (upscale ? 0.6 : 0);
  const credits = shots.length * 6 + (upscale ? 8 : 0);
  const etaSec = 90 + shots.length * 22;

  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      setPlayhead((p) => {
        if (p >= total) {
          setPlaying(false);
          return total;
        }
        return +(p + 0.1).toFixed(1);
      });
    }, 100);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, total]);

  const activeShotIndex = (() => {
    let acc = 0;
    for (let i = 0; i < shots.length; i++) {
      acc += shots[i].dur;
      if (playhead < acc) return i;
    }
    return shots.length - 1;
  })();

  const play = () => {
    if (playhead >= total) setPlayhead(0);
    setPlaying((p) => !p);
  };

  const generate = () => {
    setServerError("");
    if (backendEnabled) {
      const sourceAsset = serverAssets.find((asset) => asset.mimeType.startsWith("video/"));
      if (!sourceAsset) {
        setServerError(
          "Upload and verify a source video in Asset Library before starting a server video job.",
        );
        return;
      }
      if (!campaignId) {
        setServerError(
          "Select a campaign so UGC proof, offer, consent, and review remain traceable.",
        );
        return;
      }
      const selectedCampaign = campaigns.find((campaign) => String(campaign.id) === campaignId);
      const brief = (selectedCampaign?.brief ?? {}) as Record<string, unknown>;
      const offer =
        brief.offer && typeof brief.offer === "object" && !Array.isArray(brief.offer)
          ? (brief.offer as Record<string, unknown>)
          : {};
      const productIds = Array.isArray(brief.productIds)
        ? brief.productIds.filter((item): item is string => typeof item === "string")
        : [];
      void createServerUGCProject({
        name: `${String(selectedCampaign?.name ?? brand.name)} · UGC ${hook}`,
        campaignId,
        productId: productIds[0],
        sourceAssetIds: [sourceAsset.id],
        audience: String(brief.audience ?? brand.audience),
        problem: "Show the customer problem this campaign is solving",
        proof: String(
          offer.proof ??
            offer.claim ??
            "Use the approved product proof from the campaign Truth Lock",
        ),
        offer: String(
          offer.label ?? offer.price ?? "Use the approved offer from the campaign Truth Lock",
        ),
        language: brand.language,
        channel: "reels",
        durationSec: total,
        persona: "creator",
        consentSubject: consentSubject.trim() || undefined,
      })
        .then(async (project) => {
          const projectId = String(project.id ?? "");
          if (!projectId) throw new Error("UGC project was created without an identifier.");
          setServerJobId(projectId);
          const analyzed = await analyzeServerUGCProject(projectId, [sourceAsset.id]);
          const planned = await planServerUGCProject(projectId);
          const plannedShots = Array.isArray(planned.shots) ? planned.shots : [];
          if (plannedShots.length) {
            setShots(
              plannedShots.map((shot, index) => {
                const item = shot as Record<string, unknown>;
                const kind = String(item.kind ?? "B_ROLL").toLowerCase();
                return {
                  id: String(item.id ?? `server-shot-${index + 1}`),
                  label: `${String(item.kind ?? "B_ROLL")} · server shot plan`,
                  imgId: "",
                  dur: Number(item.durationSec ?? 4),
                  kind: kind === "hook" ? "hook" : kind === "cta" ? "cta" : "body",
                  caption: String(item.script ?? "Approved caption pending"),
                } as Shot;
              }),
            );
          }
          setServerError(
            `UGC project ${projectId} is ${String((planned.status as string | undefined) ?? "production-ready").toLowerCase()}; analysis ${String((analyzed.capabilities as Record<string, unknown> | undefined)?.transcription ? "transcription" : "partial")}; review and lock the server shot plan before rendering.`,
          );
          setStage("assemble");
          setPlayhead(0);
          setPlaying(false);
        })
        .catch((error) =>
          setServerError(
            error instanceof Error ? error.message : "The server video job could not start.",
          ),
        );
      return;
    }
    spend(`UGC video · ${shots.length} shots · hook ${hook}`, credits, "video");
    logAudit("generated video", `${brand.name} reel · hook ${hook} · ${total}s`);
    setStage("assemble");
    setPlayhead(0);
    setPlaying(false);
  };

  const renderUGC = async () => {
    if (!backendEnabled || !serverJobId) return;
    const sourceAsset = serverAssets.find((asset) => asset.mimeType.startsWith("video/"));
    if (!sourceAsset) {
      setServerError("The verified source video is no longer available.");
      return;
    }
    setServerError("Rendering verified UGC outputs…");
    try {
      const rendered = await renderServerUGCProject(serverJobId, {
        sourceAssetIds: [sourceAsset.id],
        captions: shots.map((shot) => shot.caption),
        bRollAssetIds,
        musicAssetId: musicAssetId || undefined,
        coverShotId,
        consentSubject: consentSubject.trim() || undefined,
        syntheticAvatar: consent.voice,
        outputDurationsSec: [15, 30, 45],
        idempotencyKey: uid("ugc-render"),
      });
      const mediaJob = (rendered.job as Record<string, unknown> | undefined) ?? null;
      setServerMediaJob(mediaJob);
      const reviewArtifacts =
        rendered.reviewArtifacts && typeof rendered.reviewArtifacts === "object"
          ? (rendered.reviewArtifacts as Record<string, unknown>)
          : null;
      setServerReviewTaskId(
        reviewArtifacts && typeof reviewArtifacts.reviewTaskId === "string"
          ? reviewArtifacts.reviewTaskId
          : null,
      );
      setServerQualityScores(
        reviewArtifacts?.qualityScores && typeof reviewArtifacts.qualityScores === "object"
          ? (reviewArtifacts.qualityScores as Record<string, unknown>)
          : null,
      );
      const firstOutput = Array.isArray(mediaJob?.outputAssetIds)
        ? String(mediaJob.outputAssetIds[0] ?? "")
        : "";
      if (firstOutput) {
        const preview = await getServerAssetDownload(firstOutput).catch(() => null);
        if (preview) setServerPreviewUrl(preview.url);
      }
      setServerError(
        `UGC render ${String(mediaJob?.status ?? "submitted").toLowerCase()} · ${Array.isArray(mediaJob?.outputAssetIds) ? mediaJob.outputAssetIds.length : 0} verified output asset(s) · review ${reviewArtifacts?.reviewTaskId ? "requested" : "not attached"}.`,
      );
      setStage("export");
    } catch (reason) {
      setServerError(reason instanceof Error ? reason.message : "UGC rendering failed.");
    }
  };

  const removeShot = (id: string) =>
    setShots((s) => (s.length > 2 ? s.filter((x) => x.id !== id) : s));

  const editCaption = (id: string, caption: string) =>
    setShots((s) => s.map((x) => (x.id === id ? { ...x, caption } : x)));

  const lockShot = async (shot: Shot) => {
    if (!backendEnabled || !serverJobId) return;
    try {
      await updateServerUGCShot(serverJobId, shot.id, { script: shot.caption, status: "LOCKED" });
      setLockedShotIds((current) => [...new Set([...current, shot.id])]);
    } catch (reason) {
      setServerError(reason instanceof Error ? reason.message : "The shot could not be locked.");
    }
  };

  const fmt = (t: number) => `00:${String(Math.floor(t)).padStart(2, "0")}`;

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="P2 · UGC & AI video editing"
        title="UGC Ad Studio"
        desc="Real source clip ya brief se → hooks, script, captions, cover aur platform exports. Real footage source-of-truth rehta hai; consent record aur synthetic-voice disclosure zaroori hain. Video ka cost class alag aur pehle se visible hai."
        right={
          stage !== "brief" && (
            <Btn variant="line" onClick={() => setStage("brief")}>
              New brief
            </Btn>
          )
        }
      />

      {/* stepper */}
      <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em]">
        {["strategy", "source & consent", "edit & proof", "delivery"].map((label, i) => {
          const active = stage === "brief" ? i < 2 : stage === "assemble" ? i < 3 : true;
          return (
            <div key={label} className="flex items-center gap-2">
              <span className={active ? "text-saffron-deep" : "text-ink-soft"}>
                {i + 1}. {label}
              </span>
              {i < 3 && <span className="text-line">—</span>}
            </div>
          );
        })}
      </div>

      {stage === "brief" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <Panel title="Hook variants · A/B">
              <div className="grid gap-3 p-5 sm:grid-cols-2">
                {(["A", "B"] as const).map((h) => (
                  <button
                    key={h}
                    onClick={() => setHook(h)}
                    className={`rounded-xl border p-4 text-left transition-colors ${
                      hook === h
                        ? "border-saffron-deep bg-paper-deep"
                        : "border-line hover:border-ink"
                    }`}
                  >
                    <div className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">
                      Hook {h}
                    </div>
                    <div className="mt-1 font-display text-lg font-medium">{HOOKS[h]}</div>
                  </button>
                ))}
              </div>
            </Panel>

            <Panel title="Storyboard · shot list">
              <div>
                {shots.map((s, i) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0"
                  >
                    <span className="font-mono text-[11px] text-ink-soft">{i + 1}</span>
                    {s.imgId ? (
                      <img
                        src={img(s.imgId, 96, 60)}
                        alt={s.label}
                        className="h-12 w-20 rounded object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-20 items-center justify-center rounded border border-dashed border-line font-mono text-[9px] text-ink-soft">
                        source clip
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{s.label}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 font-mono text-[9px] uppercase ${KIND_TINT[s.kind]}`}
                        >
                          {s.kind}
                        </span>
                      </div>
                      <div className="truncate font-mono text-[11px] text-ink-soft">
                        “{s.caption}”
                      </div>
                    </div>
                    <span className="font-mono text-[11px] text-ink-soft">{s.dur}s</span>
                    {backendEnabled && serverJobId && (
                      <button
                        onClick={() => void lockShot(s)}
                        className={`font-mono text-[10px] uppercase ${lockedShotIds.includes(s.id) ? "text-leaf" : "text-saffron-deep"}`}
                      >
                        {lockedShotIds.includes(s.id) ? "locked" : "lock shot"}
                      </button>
                    )}
                    <button
                      onClick={() => removeShot(s.id)}
                      className="font-mono text-[12px] text-ink-soft hover:text-saffron-deep"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <div className="space-y-6">
            {backendEnabled && (
              <Panel title="Campaign linkage · required for production UGC">
                <div className="space-y-3 p-5">
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
                  <p className="font-mono text-[10px] text-ink-soft">
                    Campaign proof, offer, Passport, review, and final delivery remain linked to
                    this UGC project.
                  </p>
                </div>
              </Panel>
            )}
            {backendEnabled && campaignId && (
              <Panel title="Proof & delivery evidence">
                <div className="space-y-2 p-5 font-mono text-[11px] text-ink-soft">
                  <div className="flex justify-between gap-3">
                    <span>Source clip</span>
                    <span className="text-leaf">
                      {serverAssets.some((asset) => asset.mimeType.startsWith("video/"))
                        ? "verified"
                        : "missing"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Product / claims</span>
                    <span className="text-leaf">campaign Truth Lock</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Disclosure</span>
                    <span className="text-leaf">AI-assisted edit recorded</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Output pack</span>
                    <span>
                      {serverMediaJob
                        ? String(serverMediaJob.status ?? "submitted")
                        : "not rendered"}
                    </span>
                  </div>
                  <p className="pt-2 leading-relaxed">
                    Real footage remains the source of truth. Synthetic likeness/voice is blocked
                    until an active consent subject is verified.
                  </p>
                </div>
              </Panel>
            )}
            <Panel title="Consent record · required for likeness">
              <div className="space-y-3 p-5">
                {(
                  [
                    ["face", "Real creator face", "Signed likeness consent on file"],
                    ["voice", "Synthetic voice clone", "Voice-rights consent + disclosure"],
                  ] as const
                ).map(([k, label, note]) => (
                  <label key={k} className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={consent[k]}
                      onChange={(e) => setConsent((c) => ({ ...c, [k]: e.target.checked }))}
                      className="mt-1 h-4 w-4 accent-saffron-deep"
                    />
                    <span>
                      <span className="block text-sm font-medium">{label}</span>
                      <span className="font-mono text-[10px] text-ink-soft">{note}</span>
                    </span>
                  </label>
                ))}
                {!consent.face && (
                  <p className="rounded-lg bg-saffron-deep/10 px-3 py-2 font-mono text-[11px] text-saffron-deep">
                    Workflow refuses unconsented likeness — cannot generate.
                  </p>
                )}
                {backendEnabled && (
                  <label className="block pt-2">
                    <span className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink-soft">
                      Consent subject ID · only if likeness is used
                    </span>
                    <input
                      value={consentSubject}
                      onChange={(event) => setConsentSubject(event.target.value)}
                      placeholder="e.g. creator-123"
                      className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm"
                    />
                  </label>
                )}
              </div>
            </Panel>

            <Panel title="Edit plan · source footage, b-roll, music and cover">
              <div className="space-y-3 p-5">
                <label className="block">
                  <span className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink-soft">
                    Cover frame
                  </span>
                  <select
                    value={coverShotId}
                    onChange={(event) => setCoverShotId(event.target.value)}
                    className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm"
                  >
                    {shots.map((shot) => (
                      <option key={shot.id} value={shot.id}>
                        {shot.label}
                      </option>
                    ))}
                  </select>
                </label>
                {backendEnabled ? (
                  <>
                    <label className="block">
                      <span className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink-soft">
                        Music asset · optional
                      </span>
                      <select
                        value={musicAssetId}
                        onChange={(event) => setMusicAssetId(event.target.value)}
                        className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm"
                      >
                        <option value="">No music asset selected</option>
                        {serverAssets
                          .filter((asset) => asset.mimeType.startsWith("audio/"))
                          .map((asset) => (
                            <option key={asset.id} value={asset.id}>
                              {asset.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <div>
                      <span className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink-soft">
                        B-roll assets · optional
                      </span>
                      <div className="space-y-1">
                        {serverAssets
                          .filter((asset) => asset.mimeType.startsWith("video/"))
                          .slice(0, 8)
                          .map((asset) => (
                            <label key={asset.id} className="flex items-center gap-2 text-[11px]">
                              <input
                                type="checkbox"
                                checked={bRollAssetIds.includes(asset.id)}
                                onChange={(event) =>
                                  setBRollAssetIds((current) =>
                                    event.target.checked
                                      ? [...new Set([...current, asset.id])]
                                      : current.filter((id) => id !== asset.id),
                                  )
                                }
                                className="h-3.5 w-3.5 accent-saffron-deep"
                              />
                              <span>{asset.name}</span>
                            </label>
                          ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="font-mono text-[10px] text-ink-soft">
                    Connect the backend to select verified b-roll and music assets.
                  </p>
                )}
                <p className="font-mono text-[10px] text-ink-soft">
                  Cover choice, source proof and audio selections are recorded with the reviewable
                  UGC manifest.
                </p>
              </div>
            </Panel>

            <Panel title="Cost quote · video class (shown first)">
              <div className="space-y-2 p-5 font-mono text-[12px]">
                <Row l="Shots" v={String(shots.length)} />
                <Row l="Est. credits" v={String(credits)} accent />
                <Row l="Provider raw cost" v={`₹${(rawUsd * USD_INR).toFixed(0)}`} />
                <Row l="Est. time" v={`~${etaSec}s`} />
                <Row l="Duration" v={`${total}s`} />
              </div>
              <div className="border-t border-line p-5">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={upscale}
                    onChange={(e) => setUpscale(e.target.checked)}
                    className="h-4 w-4 accent-saffron-deep"
                  />
                  <span className="text-sm">4K upscale + merge (+8 cr)</span>
                </label>
                <Btn
                  className="mt-4 w-full"
                  onClick={generate}
                  disabled={
                    backendEnabled
                      ? consent.voice && (!consent.face || !consentSubject.trim())
                      : !consent.face
                  }
                >
                  Reserve & generate video →
                </Btn>
              </div>
            </Panel>
          </div>
        </div>
      )}

      {serverError && <p className="font-mono text-[11px] text-saffron-deep">{serverError}</p>}

      {stage === "assemble" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            {/* preview */}
            <Panel
              title={`Preview · hook ${hook}`}
              right={<span className="font-mono text-[11px] text-ink-soft">9:16 · {total}s</span>}
            >
              <div className="flex justify-center bg-paper-deep p-6">
                <div className="relative aspect-[9/16] w-full max-w-[260px] overflow-hidden rounded-xl bg-black">
                  {backendEnabled ? (
                    serverPreviewUrl ? (
                      <img
                        src={serverPreviewUrl}
                        alt="verified server video frame"
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center p-5 text-center font-mono text-[10px] text-white/70">
                        Verified media preview appears after the renderer returns an asset.
                      </div>
                    )
                  ) : (
                    <img
                      src={img(shots[activeShotIndex].imgId, 520, 924)}
                      alt="video frame"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" />
                  {playhead < shots[0].dur && (
                    <div className="absolute left-3 right-3 top-6 text-center font-display text-xl font-medium leading-tight text-white drop-shadow">
                      {HOOKS[hook]}
                    </div>
                  )}
                  <div className="absolute bottom-14 left-3 right-3 text-center font-medium text-white drop-shadow">
                    {shots[activeShotIndex].caption}
                  </div>
                  <div className="absolute bottom-3 left-3 font-display text-xs font-semibold uppercase tracking-widest text-white/90">
                    {brand.name}
                  </div>
                </div>
              </div>
              {/* transport */}
              <div className="flex items-center gap-3 border-t border-line px-5 py-3">
                <button
                  onClick={play}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-paper"
                >
                  {playing ? "❚❚" : "▶"}
                </button>
                <span className="font-mono text-[11px] text-ink-soft">
                  {fmt(playhead)} / {fmt(total)}
                </span>
                <div className="relative h-1.5 flex-1 rounded-full bg-paper-deep">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-saffron-deep"
                    style={{ width: `${(playhead / total) * 100}%` }}
                  />
                </div>
              </div>
            </Panel>

            {/* timeline tracks */}
            <Panel title="Timeline · video / caption / audio">
              <div className="space-y-3 p-5">
                {(["video", "caption", "audio"] as const).map((track) => (
                  <div key={track} className="flex items-center gap-2">
                    <span className="w-16 shrink-0 font-mono text-[10px] uppercase text-ink-soft">
                      {track}
                    </span>
                    <div className="flex flex-1 gap-1">
                      {shots.map((s, i) => (
                        <div
                          key={s.id}
                          className={`flex h-10 items-center justify-center overflow-hidden rounded text-[10px] ${
                            i === activeShotIndex ? "ring-2 ring-saffron-deep" : ""
                          } ${track === "video" ? "" : track === "caption" ? "bg-indigo/15 text-indigo" : "bg-leaf/15 text-leaf"}`}
                          style={{
                            flexGrow: s.dur,
                            ...(track === "video" ? { backgroundColor: "#201b13" } : {}),
                          }}
                        >
                          {track === "video" ? (
                            backendEnabled ? (
                              serverPreviewUrl ? (
                                <img
                                  src={serverPreviewUrl}
                                  alt=""
                                  className="h-full w-full object-cover opacity-90"
                                />
                              ) : (
                                <span className="px-1 font-mono text-[9px] text-ink-soft">
                                  server source
                                </span>
                              )
                            ) : (
                              <img
                                src={img(s.imgId, 80, 48)}
                                alt=""
                                className="h-full w-full object-cover opacity-90"
                              />
                            )
                          ) : track === "caption" ? (
                            <span className="truncate px-1">cc</span>
                          ) : (
                            <span className="truncate px-1">
                              {s.kind === "hook" ? "♪ vo" : "♪"}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <p className="font-mono text-[10px] text-ink-soft">
                  Replacing one shot re-renders only affected steps · voice track is synthetic
                  (disclosed).
                </p>
              </div>
            </Panel>

            {/* per-shot captions */}
            <Panel title="Caption editor">
              <div className="space-y-2 p-5">
                {shots.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-2">
                    <span className="w-5 font-mono text-[11px] text-ink-soft">{i + 1}</span>
                    <input
                      value={s.caption}
                      onChange={(e) => editCaption(s.id, e.target.value)}
                      onBlur={() => {
                        if (backendEnabled && serverJobId)
                          void updateServerUGCShot(serverJobId, s.id, { script: s.caption }).catch(
                            (reason) =>
                              setServerError(
                                reason instanceof Error
                                  ? reason.message
                                  : "The shot caption could not be saved.",
                              ),
                          );
                      }}
                      className="flex-1 rounded-lg border border-line bg-paper px-3 py-1.5 text-sm outline-none focus:border-saffron-deep"
                    />
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          {/* video quality gate */}
          <div className="space-y-6">
            <Panel title="Video quality & integrity gate">
              <div className="p-5">
                <ScoreCard rows={rows} kind="video" />
                {blocked && (
                  <Btn
                    className="mt-4 w-full"
                    onClick={() => {
                      if (backendEnabled) void renderUGC();
                      else setRepaired(true);
                    }}
                  >
                    {backendEnabled
                      ? "Re-render with server QA →"
                      : "Re-render shot 1 · re-align audio"}
                  </Btn>
                )}
              </div>
            </Panel>
            <div
              className={`rounded-2xl border px-5 py-4 ${blocked ? "border-saffron-deep bg-saffron-deep/8" : "border-leaf bg-leaf/8"}`}
            >
              <div className="text-sm font-medium">
                {blocked
                  ? "Temporal failure blocks publishing until the shot is re-rendered."
                  : "Gate passed. Ready to export / send to review."}
              </div>
              <div className="mt-1 font-mono text-[11px] text-ink-soft">
                A failed clip can never silently produce a broken final video (§D5).
                {serverJobId && <span className="ml-2">· server job {serverJobId.slice(-8)}</span>}
              </div>
            </div>
            <Btn
              className="w-full"
              disabled={blocked || (backendEnabled && lockedShotIds.length === 0)}
              onClick={() => {
                if (backendEnabled) void renderUGC();
                else setStage("export");
              }}
            >
              {blocked
                ? "Blocked"
                : backendEnabled
                  ? lockedShotIds.length === 0
                    ? "Lock shot plan before render"
                    : "Render approved UGC pack →"
                  : "Merge, upscale & export →"}
            </Btn>
          </div>
        </div>
      )}

      {stage === "export" && (
        <Panel title="Delivery pack · manifest">
          {backendEnabled ? (
            <div className="space-y-3 p-5">
              <div className="rounded-lg border border-line px-3 py-3 font-mono text-[11px] text-ink-soft">
                Server media job {String(serverMediaJob?.id ?? serverJobId ?? "—")} ·{" "}
                {String(serverMediaJob?.status ?? "submitted")}
              </div>
              <div className="font-mono text-[11px] text-ink-soft">
                Outputs:{" "}
                {Array.isArray(serverMediaJob?.outputAssetIds)
                  ? serverMediaJob.outputAssetIds.length
                  : 0}{" "}
                verified media assets. Download and publish remain separate approval-gated actions.
              </div>
              <div className="rounded-lg border border-line px-3 py-3 font-mono text-[11px] text-ink-soft">
                Review task: {serverReviewTaskId ?? "not created"}. Server QA evidence is the source
                of truth for approval; publishing remains blocked until the review is approved.
              </div>
            </div>
          ) : (
            <div className="grid gap-px bg-line sm:grid-cols-2">
              {[
                ["reel_9x16_hi-IN_v3.mp4", "9:16 · 1080×1920 · 17s · H.264"],
                ["reel_1x1_hi-IN_v3.mp4", "1:1 · 1080×1080 · 17s · H.264"],
                ["cover_9x16.jpg", "Poster frame · shot 2"],
                ["captions_hi-IN.srt", "Burned + sidecar subtitle track"],
              ].map(([f, meta]) => (
                <div key={f} className="flex items-center justify-between bg-card px-5 py-4">
                  <div>
                    <div className="font-mono text-[12px]">{f}</div>
                    <div className="font-mono text-[10px] text-ink-soft">{meta}</div>
                  </div>
                  <span className="font-mono text-[11px] text-saffron-deep">↓</span>
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-line px-5 py-4 font-mono text-[11px] leading-relaxed text-ink-soft">
            Manifest records: hook {hook}, brand {brand.name}, synthetic-voice disclosure ={" "}
            {consent.voice ? "yes" : "no"}, consent subject {consentSubject || "not used"}, upscale{" "}
            {upscale ? "on" : "off"}. Default is export/draft — public publishing needs a connector
            + confirmation.
          </div>
          <div className="flex gap-2 border-t border-line px-5 py-4">
            <Btn variant="line" onClick={() => setStage("assemble")}>
              Back
            </Btn>
            <Btn
              onClick={() => {
                if (backendEnabled) {
                  setServerError(
                    "Server outputs are stored as verified assets; use the Review Room or Export manifest for downloadable files.",
                  );
                  return;
                }
                logAudit("exported video pack", `${brand.name} reel · 4 files`);
              }}
            >
              Download ZIP
            </Btn>
          </div>
        </Panel>
      )}
    </div>
  );
}

function Row({ l, v, accent }: { l: string; v: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-soft">{l}</span>
      <span className={accent ? "text-saffron-deep" : ""}>{v}</span>
    </div>
  );
}
