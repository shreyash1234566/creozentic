import { access } from "node:fs/promises";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

const execFileAsync = promisify(execFile);

export type RenderVisualInsert = {
  imagePath?: string;
  videoPath?: string;
  startSec: number;
  endSec: number;
  x?: string;
  y?: string;
  width?: number;
  height?: number;
};

export type RenderInput = {
  sourcePath: string;
  outputPath: string;
  durationSec?: number;
  width?: number;
  height?: number;
  visualInserts?: RenderVisualInsert[];
};

export async function renderEditorVideo(input: RenderInput) {
  await access(input.sourcePath);
  if (!input.outputPath || input.outputPath.includes("..")) throw new Error("Invalid output path.");
  const width = input.width ?? 1080;
  const height = input.height ?? 1920;
  const inserts = (input.visualInserts ?? []).filter(
    (insert) =>
      (insert.imagePath || insert.videoPath) &&
      Number.isFinite(insert.startSec) &&
      Number.isFinite(insert.endSec) &&
      insert.endSec > insert.startSec,
  );
  const args = ["-y", "-i", input.sourcePath];
  for (const insert of inserts) {
    if (insert.imagePath) args.push("-loop", "1", "-i", insert.imagePath);
    else args.push("-i", insert.videoPath!);
  }
  args.push("-map", "0:a:0?");
  if (inserts.length) {
    const filters = [
      `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2[base]`,
    ];
    let current = "base";
    inserts.forEach((insert, index) => {
      const mediaLabel = `media${index}`;
      const next = `v${index}`;
      const x = insert.x ?? `(W-w)/2`;
      const y = insert.y ?? `(H-h)/2`;
      const scale = `scale=${insert.width ?? Math.round(width * 0.82)}:${insert.height ?? Math.round(height * 0.62)}:force_original_aspect_ratio=decrease`;
      filters.push(
        insert.imagePath
          ? `[${index + 1}:v]${scale}[${mediaLabel}]`
          : `[${index + 1}:v]setpts=PTS-STARTPTS,${scale}[${mediaLabel}]`,
      );
      filters.push(
        `[${current}][${mediaLabel}]overlay=${x}:${y}:enable='between(t,${Math.max(0, insert.startSec)},${Math.max(insert.startSec, insert.endSec)})'[${next}]`,
      );
      current = next;
    });
    args.push("-filter_complex", `${filters.join(";")};[${current}]null[vout]`, "-map", "[vout]");
  } else {
    args.push(
      "-vf",
      `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
      "-map",
      "0:v:0?",
    );
  }
  args.push(
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    "-movflags",
    "+faststart",
  );
  if (input.durationSec) args.push("-t", String(Math.max(0.1, Math.min(input.durationSec, 900))));
  args.push(input.outputPath);
  const result = await execFileAsync(process.env.FFMPEG_PATH ?? "ffmpeg", args, {
    timeout: 15 * 60_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  return {
    outputPath: input.outputPath,
    rendererVersion: "ffmpeg-editor-v2-image-video-inserts",
    stderr: result.stderr,
  };
}
