import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { configuredGateway } from "./provider-adapters";

const execFileAsync = promisify(execFile);

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
  entities?: unknown;
  ocr?: unknown;
  sourceChecksum?: string;
  extractorVersion: string;
};

export async function extractMediaEvidence(input: { assetPath: string; language?: string }) {
  const { stdout } = await execFileAsync(
    process.env.FFPROBE_PATH ?? "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration:stream=codec_type,codec_name,width,height,sample_rate",
      "-of",
      "json",
      input.assetPath,
    ],
    { timeout: 60_000 },
  );
  const parsed = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: Array<Record<string, unknown>>;
  };
  const speech = configuredGateway("deepgram");
  const transcript = speech
    ? await speech.transcribe({
        assetUrl: input.assetPath,
        language: input.language,
        diarize: true,
      })
    : undefined;
  return {
    durationSec: Number(parsed.format?.duration ?? 0),
    streams: (parsed.streams ?? []).map((stream) => ({
      type: String(stream.codec_type ?? "unknown"),
      codec: typeof stream.codec_name === "string" ? stream.codec_name : undefined,
      width: typeof stream.width === "number" ? stream.width : undefined,
      height: typeof stream.height === "number" ? stream.height : undefined,
      sampleRate: typeof stream.sample_rate === "number" ? stream.sample_rate : undefined,
    })),
    transcript: transcript?.transcript,
    extractorVersion: "ffprobe-evidence-v1",
  } satisfies EvidenceBundle;
}
