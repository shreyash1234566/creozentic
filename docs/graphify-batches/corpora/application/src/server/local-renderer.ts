import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readLocalObject, writeLocalObject } from "./storage";

const execFileAsync = promisify(execFile);

type SourceAsset = { id: string; objectKey: string; mimeType: string; name: string };
type LocalRenderInput = {
  workspaceId: string;
  jobId: string;
  kind: string;
  sourceAssets: SourceAsset[];
  config: Record<string, unknown>;
};

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function escapeXml(value: string) {
  return value.replace(/[&<>\"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;",
    };
    return entities[character];
  });
}

function dimensions(config: Record<string, unknown>) {
  const ratio = text(config.ratio);
  if (ratio === "story" || ratio === "9:16") return { width: 1080, height: 1920 };
  if (ratio === "land" || ratio === "1.91:1") return { width: 1200, height: 628 };
  return { width: 1080, height: 1080 };
}

function hash(buffer: Uint8Array) {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

async function sourceImageDataUri(input: LocalRenderInput) {
  const source = input.sourceAssets.find((asset) => asset.mimeType.startsWith("image/"));
  if (!source) return null;
  try {
    const object = await readLocalObject(source.objectKey);
    if (object.body.byteLength > 12_000_000) return null;
    return `data:${source.mimeType};base64,${object.body.toString("base64")}`;
  } catch {
    return null;
  }
}

async function svgComposition(input: LocalRenderInput) {
  const { width, height } = dimensions(input.config);
  const layers = Array.isArray(input.config.layers) ? input.config.layers : [];
  const accent = /^#[0-9a-f]{6}$/i.test(text(input.config.accent))
    ? text(input.config.accent)
    : "#d1560f";
  const overlay = Math.min(90, Math.max(0, Number(input.config.overlay) || 0));
  const layerMarkup = layers
    .map((raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "";
      const layer = raw as Record<string, unknown>;
      const x = Math.min(98, Math.max(2, Number(layer.x) || 0));
      const y = Math.min(98, Math.max(2, Number(layer.y) || 0));
      const value = escapeXml(text(layer.text));
      const kind = text(layer.kind);
      const fontSize =
        kind === "headline"
          ? Math.max(28, Math.round(width / 22))
          : Math.max(16, Math.round(width / 58));
      if (kind === "cta")
        return `<g transform="translate(${(x / 100) * width} ${(y / 100) * height})"><rect x="0" y="-${fontSize}" width="${Math.max(180, value.length * fontSize * 0.55 + 56)}" height="${fontSize * 2.1}" rx="${fontSize}" fill="${accent}"/><text x="28" y="${fontSize * 0.45}" fill="#ffffff" font-family="Arial,sans-serif" font-size="${fontSize}">${value} →</text></g>`;
      return `<text x="${(x / 100) * width}" y="${(y / 100) * height}" fill="#ffffff" font-family="Arial,sans-serif" font-size="${fontSize}" font-weight="${kind === "headline" ? 700 : 600}" dominant-baseline="middle">${value}</text>`;
    })
    .join("");
  const sourceName = escapeXml(input.sourceAssets[0]?.name ?? "source asset");
  const sourceImage = await sourceImageDataUri(input);
  const imageMarkup = sourceImage
    ? `<image href="${sourceImage}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"/>`
    : `<rect width="100%" height="100%" fill="url(#bg)"/>`;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#241b17"/><stop offset="1" stop-color="#776052"/></linearGradient></defs>${imageMarkup}<rect width="100%" height="100%" fill="#000000" opacity="${(overlay / 100).toFixed(3)}"/><text x="${width - 24}" y="${height - 20}" text-anchor="end" fill="#ffffff" opacity="0.42" font-family="Arial,sans-serif" font-size="12">${sourceName}</text>${layerMarkup}</svg>`,
  );
}

function ffmpegPath() {
  return process.env.FFMPEG_PATH ?? "ffmpeg";
}

function escapeFfmpegText(value: string) {
  return value
    .replace(/[\\':%]/g, "\\$&")
    .replace(/\r?\n/g, " ")
    .slice(0, 240);
}

function ffmpegFontFile() {
  const configured = process.env.FFMPEG_FONT_PATH?.trim();
  if (!configured) return undefined;
  return configured.replace(/\\/g, "/").replace(":", "\\:");
}

function outputExtension(asset: SourceAsset) {
  const candidate = asset.name.split(".").pop()?.toLowerCase();
  if (candidate && /^[a-z0-9]{1,8}$/.test(candidate)) return candidate;
  if (asset.mimeType === "audio/mpeg") return "mp3";
  if (asset.mimeType === "audio/wav") return "wav";
  if (asset.mimeType === "video/webm") return "webm";
  return "mp4";
}

export async function renderLocally(input: LocalRenderInput) {
  if (input.kind === "video.lipsync")
    throw new Error("Lip-sync requires a configured consent-aware media provider.");
  if (input.kind === "composition.render") {
    const body = await svgComposition(input);
    const objectKey = `workspaces/${input.workspaceId}/media/${input.jobId}/composition.svg`;
    await writeLocalObject(objectKey, body, "image/svg+xml");
    return {
      provider: "local-deterministic-renderer",
      actualUnits: 1,
      outputs: [
        {
          name: "composition.svg",
          mimeType: "image/svg+xml",
          objectKey,
          contentHash: hash(body),
          width: dimensions(input.config).width,
          height: dimensions(input.config).height,
          metadata: {
            renderer: "svg",
            templateId: input.config.templateId,
            templateVersion: input.config.templateVersion,
            sourceEmbedded: Boolean(await sourceImageDataUri(input)),
            deterministic: true,
          },
        },
      ],
    };
  }
  if (["video.merge", "captions.render", "audio.mix", "upscale"].includes(input.kind)) {
    if (!input.sourceAssets[0]?.objectKey) throw new Error("A local source object is required.");
    const videoAssets = input.sourceAssets.filter((asset) => asset.mimeType.startsWith("video/"));
    if (videoAssets.length > 0 && input.kind !== "audio.mix") {
      const work = join(tmpdir(), `autozentic-${randomUUID()}`);
      await mkdir(work, { recursive: true });
      const sourcePaths: string[] = [];
      for (const [index, asset] of videoAssets.entries()) {
        const sourceObject = await readLocalObject(asset.objectKey);
        const sourcePath = join(work, `source-${index}.${outputExtension(asset)}`);
        await writeFile(sourcePath, sourceObject.body);
        sourcePaths.push(sourcePath);
      }
      const outputPath = join(work, "output.mp4");
      const args = ["-y"];
      if (input.kind === "video.merge" && sourcePaths.length > 1) {
        const concatPath = join(work, "concat.txt");
        await writeFile(
          concatPath,
          sourcePaths.map((sourcePath) => `file '${sourcePath.replace(/'/g, "'\\''")}'`).join("\n"),
          "utf8",
        );
        args.push("-f", "concat", "-safe", "0", "-i", concatPath);
      } else {
        args.push("-i", sourcePaths[0]);
      }
      const duration = Number(input.config.durationSeconds);
      if (Number.isFinite(duration) && duration > 0)
        args.push("-t", String(Math.min(duration, 180)));
      if (input.kind === "upscale") args.push("-vf", "scale=iw*2:ih*2:flags=lanczos");
      if (input.kind === "captions.render") {
        const captionText = Array.isArray(input.config.captions)
          ? input.config.captions.map(text).join(" ")
          : text(input.config.captionText ?? input.config.captions);
        if (captionText) {
          const fontFile = ffmpegFontFile();
          const font = fontFile ? `fontfile='${fontFile}'` : "font='Sans'";
          args.push(
            "-vf",
            `drawtext=${font}:fontcolor=white:fontsize=48:box=1:boxcolor=black@0.45:boxborderw=12:text='${escapeFfmpegText(captionText)}':x=(w-text_w)/2:y=h-180`,
          );
        }
      }
      args.push(
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        outputPath,
      );
      try {
        await execFileAsync(ffmpegPath(), args, {
          timeout: 180_000,
          windowsHide: true,
          maxBuffer: 2 * 1024 * 1024,
        });
        const rendered = await readFile(outputPath);
        const outputName =
          input.kind === "video.merge"
            ? "merged.mp4"
            : input.kind === "captions.render"
              ? "captioned.mp4"
              : input.kind === "upscale"
                ? "upscaled.mp4"
                : "video.mp4";
        const objectKey = `workspaces/${input.workspaceId}/media/${input.jobId}/${outputName}`;
        await writeLocalObject(objectKey, rendered, "video/mp4");
        return {
          provider: "local-ffmpeg-renderer",
          actualUnits: 1,
          outputs: [
            {
              name: outputName,
              mimeType: "video/mp4",
              objectKey,
              contentHash: hash(rendered),
              metadata: { renderer: "ffmpeg", kind: input.kind, deterministic: true },
            },
          ],
        };
      } finally {
        await rm(work, { recursive: true, force: true });
      }
    }
    if (input.kind === "audio.mix") {
      const audioAssets = input.sourceAssets.filter(
        (asset) => asset.mimeType.startsWith("audio/") || asset.mimeType.startsWith("video/"),
      );
      if (audioAssets.length === 0) throw new Error("An audio or video source is required.");
      const work = join(tmpdir(), `autozentic-${randomUUID()}`);
      await mkdir(work, { recursive: true });
      try {
        const sourcePaths: string[] = [];
        for (const [index, asset] of audioAssets.entries()) {
          const sourceObject = await readLocalObject(asset.objectKey);
          const sourcePath = join(work, `audio-${index}.${outputExtension(asset)}`);
          await writeFile(sourcePath, sourceObject.body);
          sourcePaths.push(sourcePath);
        }
        const outputPath = join(work, "mixed.m4a");
        const args = ["-y", ...sourcePaths.flatMap((sourcePath) => ["-i", sourcePath])];
        if (sourcePaths.length > 1) {
          args.push(
            "-filter_complex",
            `amix=inputs=${sourcePaths.length}:duration=longest:dropout_transition=2[a]`,
            "-map",
            "[a]",
          );
        }
        args.push(
          "-af",
          "loudnorm=I=-14:TP=-1.5:LRA=11",
          "-ar",
          "48000",
          "-c:a",
          "aac",
          "-b:a",
          "192k",
          outputPath,
        );
        await execFileAsync(ffmpegPath(), args, {
          timeout: 180_000,
          windowsHide: true,
          maxBuffer: 2 * 1024 * 1024,
        });
        const rendered = await readFile(outputPath);
        const objectKey = `workspaces/${input.workspaceId}/media/${input.jobId}/mixed.m4a`;
        await writeLocalObject(objectKey, rendered, "audio/mp4");
        return {
          provider: "local-ffmpeg-renderer",
          actualUnits: 1,
          outputs: [
            {
              name: "mixed.m4a",
              mimeType: "audio/mp4",
              objectKey,
              contentHash: hash(rendered),
              metadata: { renderer: "ffmpeg", kind: input.kind, deterministic: true },
            },
          ],
        };
      } finally {
        await rm(work, { recursive: true, force: true });
      }
    }
  }
  if (input.kind === "upscale") {
    const sourceObject = await readLocalObject(input.sourceAssets[0].objectKey);
    const objectKey = `workspaces/${input.workspaceId}/media/${input.jobId}/upscaled-${input.sourceAssets[0].name}`;
    await writeLocalObject(objectKey, sourceObject.body, input.sourceAssets[0].mimeType);
    return {
      provider: "local-deterministic-renderer",
      actualUnits: 1,
      outputs: [
        {
          name: `upscaled-${input.sourceAssets[0].name}`,
          mimeType: input.sourceAssets[0].mimeType,
          objectKey,
          contentHash: hash(sourceObject.body),
          metadata: {
            renderer: "passthrough-local-upscale",
            deterministic: true,
            quality: "source-preserving-copy",
            warning:
              "Image super-resolution is not configured; bytes were preserved without enlargement.",
          },
        },
      ],
    };
  }
  throw new Error(`Local renderer does not support ${input.kind} for this source type.`);
}
