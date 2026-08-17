import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type RenderInput = {
  sourcePath: string;
  outputPath: string;
  durationSec?: number;
  width?: number;
  height?: number;
};

export async function renderEditorVideo(input: RenderInput) {
  await access(input.sourcePath);
  if (!input.outputPath || input.outputPath.includes("..")) throw new Error("Invalid output path.");
  const args = [
    "-y",
    "-i",
    input.sourcePath,
    "-map",
    "0:v:0?",
    "-map",
    "0:a:0?",
    "-vf",
    `scale=${input.width ?? 1080}:${input.height ?? 1920}:force_original_aspect_ratio=decrease,pad=${input.width ?? 1080}:${input.height ?? 1920}:(ow-iw)/2:(oh-ih)/2`,
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
  ];
  if (input.durationSec) args.push("-t", String(Math.max(0.1, Math.min(input.durationSec, 900))));
  args.push(input.outputPath);
  const result = await execFileAsync(process.env.FFMPEG_PATH ?? "ffmpeg", args, {
    timeout: 15 * 60_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  return {
    outputPath: input.outputPath,
    rendererVersion: "ffmpeg-editor-v1",
    stderr: result.stderr,
  };
}
