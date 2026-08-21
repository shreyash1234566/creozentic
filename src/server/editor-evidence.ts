import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { configuredGateway } from "./provider-adapters";

const execFileAsync = promisify(execFile);

type NumericRecord = Record<string, unknown>;

export type EvidenceBundle = {
  durationSec: number;
  streams: Array<{
    type: string;
    codec?: string;
    width?: number;
    height?: number;
    sampleRate?: number;
  }>;
  transcript?: unknown;
  transcriptWords: Array<{ word: string; startSec: number; endSec: number; confidence?: number }>;
  shots: Array<{ startSec: number; endSec: number; confidence?: number }>;
  audioWindows: Array<{ startSec: number; endSec: number; features: NumericRecord }>;
  entities: Array<{ label: string; confidence: number; region?: NumericRecord }>;
  ocrRegions: Array<{ text: string; confidence: number; region: NumericRecord }>;
  regions: Array<{ label: string; x: number; y: number; width: number; height: number }>;
  transcriptProvider?: string;
  sourceChecksum: string;
  extractorVersion: string;
};

function record(value: unknown): NumericRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as NumericRecord)
    : {};
}

function numberValue(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeWords(transcript: unknown): EvidenceBundle["transcriptWords"] {
  const root = record(transcript);
  const words = list(root.words ?? root.segments ?? transcript);
  return words.flatMap((item) => {
    const word = record(item);
    const text = String(word.word ?? word.text ?? "").trim();
    const startSec = numberValue(word.startSec ?? word.start ?? word.startTime);
    const endSec = numberValue(word.endSec ?? word.end ?? word.endTime);
    if (!text || startSec === undefined || endSec === undefined) return [];
    return [{ word: text, startSec, endSec, confidence: numberValue(word.confidence) }];
  });
}

function normalizeShots(value: unknown): EvidenceBundle["shots"] {
  return list(value).flatMap((item) => {
    const shot = record(item);
    const startSec = numberValue(shot.startSec ?? shot.start);
    const endSec = numberValue(shot.endSec ?? shot.end);
    if (startSec === undefined || endSec === undefined || endSec <= startSec) return [];
    return [{ startSec, endSec, confidence: numberValue(shot.confidence) }];
  });
}

function normalizeAudioWindows(value: unknown): EvidenceBundle["audioWindows"] {
  return list(value).flatMap((item) => {
    const window = record(item);
    const startSec = numberValue(window.startSec ?? window.start);
    const endSec = numberValue(window.endSec ?? window.end);
    if (startSec === undefined || endSec === undefined || endSec <= startSec) return [];
    return [{ startSec, endSec, features: record(window.features ?? window) }];
  });
}

function normalizeEntities(value: unknown): EvidenceBundle["entities"] {
  return list(value).flatMap((item) => {
    const entity = record(item);
    const label = String(entity.label ?? entity.name ?? "").trim();
    const confidence = numberValue(entity.confidence);
    if (!label || confidence === undefined) return [];
    return [
      {
        label,
        confidence,
        region: Object.keys(record(entity.region)).length ? record(entity.region) : undefined,
      },
    ];
  });
}

function normalizeOcr(value: unknown): EvidenceBundle["ocrRegions"] {
  return list(value).flatMap((item) => {
    const region = record(item);
    const text = String(region.text ?? "").trim();
    const confidence = numberValue(region.confidence);
    if (!text || confidence === undefined) return [];
    return [{ text, confidence, region: record(region.region ?? region.bounds) }];
  });
}

export class MediaEvidenceExtractionError extends Error {
  constructor(
    message: string,
    readonly details: { stage: string; retryable: boolean; stderr?: string } = { stage: "media-evidence", retryable: true },
  ) {
    super(message);
  }
}

export async function extractMediaEvidence(input: {
  assetPath: string;
  language?: string;
  requireTranscript?: boolean;
}): Promise<EvidenceBundle> {
  const workerPath = process.env.MEDIA_ANALYSIS_WORKER_PATH ?? "apps/worker/media_analysis.py";
  let workerPayload: Record<string, unknown> = {};
  try {
    const { stdout } = await execFileAsync(
      process.env.MEDIA_ANALYSIS_PYTHON ?? "python3",
      [workerPath, input.assetPath, ...(input.language ? ["--language", input.language] : [])],
      { timeout: Number(process.env.MEDIA_ANALYSIS_TIMEOUT_MS ?? 120_000) },
    );
    workerPayload = record(JSON.parse(stdout));
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown media worker failure.";
    throw new MediaEvidenceExtractionError(`Media analysis worker failed: ${detail}`, {
      stage: "media-analysis-worker",
      retryable: true,
      stderr: detail,
    });
  }
  const media = record(workerPayload.media);
  const durationSec = numberValue(workerPayload.durationSec ?? media.durationSec) ?? 0;
  const streams = list(workerPayload.streams ?? media.streams).map((item) => record(item));
  const localTranscript = normalizeWords(workerPayload.transcript);
  const isRemoteAsset = /^https?:\/\//i.test(input.assetPath);
  const speech = localTranscript.length || !isRemoteAsset ? undefined : configuredGateway("deepgram");
  const transcriptResult = speech
    ? await speech.transcribe({ assetUrl: input.assetPath, language: input.language, diarize: true })
    : undefined;
  const transcript = transcriptResult?.transcript ?? workerPayload.transcript;
  const transcriptWords = normalizeWords(transcript);
  if (input.requireTranscript !== false && transcriptWords.length === 0) {
    throw new MediaEvidenceExtractionError(
      "No timed transcript was produced. Configure an original speech worker or provide an authorized remote transcription asset.",
      { stage: "transcription", retryable: false },
    );
  }
  const extractorVersions = record(workerPayload.extractor_versions);
  const sourceChecksum = createHash("sha256")
    .update(JSON.stringify({ media, streams, transcript, extractorVersions }))
    .digest("hex");
  return {
    durationSec,
    streams: streams.map((stream) => ({
      type: String(stream.codec_type ?? stream.type ?? "unknown"),
      codec: typeof stream.codec_name === "string" ? stream.codec_name : typeof stream.codec === "string" ? stream.codec : undefined,
      width: numberValue(stream.width),
      height: numberValue(stream.height),
      sampleRate: numberValue(stream.sample_rate ?? stream.sampleRate),
    })),
    transcript,
    transcriptWords,
    shots: normalizeShots(workerPayload.shot_boundaries),
    audioWindows: normalizeAudioWindows(workerPayload.audio_windows),
    entities: normalizeEntities(workerPayload.detected_entities),
    ocrRegions: normalizeOcr(workerPayload.ocr_regions),
    regions: [],
    transcriptProvider: transcriptResult?.providerId ?? (localTranscript.length ? "source-media-analysis-worker" : undefined),
    sourceChecksum,
    extractorVersion: String(extractorVersions.scenedetect ?? "source-media-analysis-worker-v1"),
  } satisfies EvidenceBundle;
}

export { normalizeAudioWindows, normalizeEntities, normalizeOcr, normalizeShots, normalizeWords };
