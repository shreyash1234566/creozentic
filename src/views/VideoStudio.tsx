import { useEffect, useRef, useState } from "react";
import { PageHeader, Panel, Btn } from "../ui";
import { useStore } from "../store";
import { SAMPLE_IMAGES, USD_INR, img } from "../data";
import { createServerMediaJob, getServerAssetDownload, getServerState } from "../client/api";
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

// video quality gate — temporal flaw clears only when the shot is re-rendered
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
  const [shots, setShots] = useState<Shot[]>(BASE_SHOTS);
  const [consent, setConsent] = useState({ face: true, voice: false });
  const [upscale, setUpscale] = useState(true);
  const [repaired, setRepaired] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [serverAssets, setServerAssets] = useState<
    Awaited<ReturnType<typeof getServerState>>["assets"]
  >([]);
  const [serverJobId, setServerJobId] = useState<string | null>(null);
  const [serverPreviewUrl, setServerPreviewUrl] = useState<string | null>(null);
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
  }, [backendEnabled]);

  const total = shots.reduce((s, x) => s + x.dur, 0);
  const rows: ScoreRow[] = DIMENSIONS.map((d) => {
    const v = buildVerdicts(repaired)[d.dim];
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
      void createServerMediaJob({
        kind: "video.merge",
        sourceAssetIds: [sourceAsset.id],
        config: {
          hook,
          captions: shots.map((shot) => ({ start: shot.id, text: shot.caption })),
          durationSeconds: total,
          upscale,
          syntheticVoice: consent.voice,
          disclosure: true,
        },
        idempotencyKey: uid("video"),
      })
        .then((result) => {
          const job = result.job as { id?: string } | undefined;
          setServerJobId(job?.id ?? null);
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

  const removeShot = (id: string) =>
    setShots((s) => (s.length > 2 ? s.filter((x) => x.id !== id) : s));

  const editCaption = (id: string, caption: string) =>
    setShots((s) => s.map((x) => (x.id === id ? { ...x, caption } : x)));

  const fmt = (t: number) => `00:${String(Math.floor(t)).padStart(2, "0")}`;

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="P2 · UGC & AI video editing"
        title="Video Studio"
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
        {(["brief", "assemble", "export"] as Stage[]).map((s, i) => {
          const order = ["brief", "assemble", "export"];
          const active = order.indexOf(stage) >= i;
          return (
            <div key={s} className="flex items-center gap-2">
              <span className={active ? "text-saffron-deep" : "text-ink-soft"}>
                {i + 1}. {s}
              </span>
              {i < 2 && <span className="text-line">—</span>}
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
                    <img
                      src={img(s.imgId, 96, 60)}
                      alt={s.label}
                      className="h-12 w-20 rounded object-cover"
                    />
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
                <Btn className="mt-4 w-full" onClick={generate} disabled={!consent.face}>
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
                  <img
                    src={
                      backendEnabled
                        ? (serverPreviewUrl ?? "")
                        : img(shots[activeShotIndex].imgId, 520, 924)
                    }
                    alt="video frame"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
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
                            <img
                              src={backendEnabled ? (serverPreviewUrl ?? "") : img(s.imgId, 80, 48)}
                              alt=""
                              className="h-full w-full object-cover opacity-90"
                            />
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
                  <Btn className="mt-4 w-full" onClick={() => setRepaired(true)}>
                    Re-render shot 1 · re-align audio
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
            <Btn className="w-full" disabled={blocked} onClick={() => setStage("export")}>
              {blocked ? "Blocked" : "Merge, upscale & export →"}
            </Btn>
          </div>
        </div>
      )}

      {stage === "export" && (
        <Panel title="Delivery pack · manifest">
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
          <div className="border-t border-line px-5 py-4 font-mono text-[11px] leading-relaxed text-ink-soft">
            Manifest records: hook {hook}, brand v7, synthetic-voice disclosure = yes, consent (face
            ✓{consent.voice ? ", voice ✓" : ""}), upscale {upscale ? "on" : "off"}. Default is
            export/draft — public publishing needs a connector + confirmation.
          </div>
          <div className="flex gap-2 border-t border-line px-5 py-4">
            <Btn variant="line" onClick={() => setStage("assemble")}>
              Back
            </Btn>
            <Btn onClick={() => logAudit("exported video pack", `${brand.name} reel · 4 files`)}>
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
