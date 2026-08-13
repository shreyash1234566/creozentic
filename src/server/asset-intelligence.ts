import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Prisma } from "@prisma/client";
import { ApiError } from "./api";
import { db } from "./db";
import { readLocalObject, localStorageEnabled } from "./storage";
import type { RequestContext } from "./auth";
import { providerApiError, requestProvider } from "./provider-http";

const execFileAsync = promisify(execFile);

function json(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function ffprobePath() {
  return (
    process.env.FFPROBE_PATH ??
    process.env.FFMPEG_PATH?.replace(/ffmpeg(?:\.exe)?$/i, "ffprobe.exe") ??
    "ffprobe"
  );
}

async function optionalProvider(endpoint: string | undefined, payload: Record<string, unknown>) {
  if (!endpoint) return null;
  try {
    const { body } = await requestProvider<unknown>({
      provider: "asset-intelligence",
      endpoint,
      body: payload,
      headers: process.env.INTELLIGENCE_PROVIDER_API_KEY
        ? { authorization: `Bearer ${process.env.INTELLIGENCE_PROVIDER_API_KEY}` }
        : undefined,
      idempotencyKey: `asset-intelligence:${String(payload.assetId)}:${String(payload.contentHash)}`,
      timeoutMs: 120_000,
    });
    return record(body);
  } catch (error) {
    throw providerApiError(
      error,
      "INTELLIGENCE_PROVIDER_FAILED",
      "The intelligence provider failed.",
    );
  }
}

function signatureVerdict(body: Buffer, mimeType: string, name: string) {
  const lowerName = name.toLowerCase();
  const signature = body.subarray(0, 16).toString("hex").toUpperCase();
  const checks = [
    { when: mimeType === "image/png", ok: signature.startsWith("89504E470D0A1A0A") },
    { when: mimeType === "image/jpeg", ok: signature.startsWith("FFD8FF") },
    { when: mimeType === "image/gif", ok: signature.startsWith("47494638") },
    { when: mimeType === "application/pdf", ok: body.subarray(0, 5).toString() === "%PDF-" },
    { when: mimeType === "video/mp4", ok: body.subarray(4, 8).toString() === "ftyp" },
    {
      when: mimeType === "audio/mpeg",
      ok: body.subarray(0, 3).toString() === "ID3" || body[0] === 0xff,
    },
  ];
  const relevant = checks.filter((check) => check.when);
  const mismatch = relevant.length > 0 && relevant.some((check) => !check.ok);
  const dangerous =
    body
      .toString("latin1")
      .includes("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!") ||
    /(?:javascript:|<script|powershell\s+-enc|cmd\.exe\s+\/c)/i.test(
      body.subarray(0, 2_000_000).toString("latin1"),
    );
  return {
    status: dangerous || mismatch ? "FAILED" : "PASSED",
    scanner: "local-signature-scanner",
    version: "1",
    details: {
      dangerous,
      mimeMismatch: mismatch,
      signature,
      file: lowerName,
      checkedBytes: body.byteLength,
    },
  };
}

async function scanAsset(
  context: RequestContext,
  assetId: string,
  kind: "MALWARE" | "OCR" | "MASKING" | "INTEGRITY",
) {
  const asset = await db.asset.findFirst({
    where: { id: assetId, workspaceId: context.workspaceId, deletedAt: null },
  });
  if (!asset)
    throw new ApiError(404, "ASSET_NOT_FOUND", "The asset was not found in this workspace.");
  const key = `${asset.id}:${asset.contentHash}:${kind}:v1`;
  const existing = await db.assetScan.findUnique({
    where: {
      workspaceId_idempotencyKey: { workspaceId: context.workspaceId, idempotencyKey: key },
    },
  });
  if (existing) return existing;

  let result: {
    status: string;
    scanner: string;
    version?: string;
    details: Record<string, unknown>;
  };
  if (kind === "MALWARE") {
    if (!localStorageEnabled()) {
      const provider = await optionalProvider(process.env.MALWARE_SCAN_PROVIDER_URL, {
        assetId: asset.id,
        objectKey: asset.objectKey,
        mimeType: asset.mimeType,
        contentHash: asset.contentHash,
      });
      result = provider
        ? {
            status: String(provider.status ?? "PENDING"),
            scanner: String(provider.scanner ?? "configured-malware-provider"),
            version: String(provider.version ?? "1"),
            details: provider,
          }
        : {
            status: "UNAVAILABLE",
            scanner: "not-configured",
            details: {
              reason:
                "Configure MALWARE_SCAN_PROVIDER_URL or use local object storage for signature scanning.",
            },
          };
    } else {
      const object = await readLocalObject(asset.objectKey);
      result = signatureVerdict(object.body, asset.mimeType, asset.name);
    }
  } else if (kind === "OCR") {
    const provider = await optionalProvider(process.env.OCR_PROVIDER_URL, {
      assetId: asset.id,
      objectKey: asset.objectKey,
      mimeType: asset.mimeType,
      contentHash: asset.contentHash,
    });
    result = provider
      ? {
          status: "PASSED",
          scanner: String(provider.provider ?? "configured-ocr-provider"),
          version: String(provider.version ?? "1"),
          details: provider,
        }
      : {
          status: "UNAVAILABLE",
          scanner: "not-configured",
          details: {
            reason: "OCR_PROVIDER_URL is not configured; OCR is never fabricated locally.",
          },
        };
  } else if (kind === "MASKING") {
    const provider = await optionalProvider(process.env.MASKING_PROVIDER_URL, {
      assetId: asset.id,
      objectKey: asset.objectKey,
      mimeType: asset.mimeType,
      contentHash: asset.contentHash,
    });
    result = provider
      ? {
          status: "PASSED",
          scanner: String(provider.provider ?? "configured-masking-provider"),
          version: String(provider.version ?? "1"),
          details: provider,
        }
      : {
          status: "REQUIRES_PROVIDER",
          scanner: "not-configured",
          details: {
            reason:
              "Product masking requires a vision segmentation provider and is blocked until one is configured.",
          },
        };
  } else {
    let exactHash = asset.contentHash;
    if (localStorageEnabled()) {
      const object = await readLocalObject(asset.objectKey);
      exactHash = `sha256:${createHash("sha256").update(object.body).digest("hex")}`;
    }
    const provider = await optionalProvider(process.env.INTEGRITY_PROVIDER_URL, {
      assetId: asset.id,
      objectKey: asset.objectKey,
      mimeType: asset.mimeType,
      contentHash: exactHash,
    });
    result = provider
      ? {
          status: String(provider.status ?? "REVIEW"),
          scanner: String(provider.provider ?? "configured-integrity-provider"),
          version: String(provider.version ?? "1"),
          details: { ...provider, exactHash },
        }
      : {
          status: exactHash === asset.contentHash ? "PASSED" : "FAILED",
          scanner: "local-content-hash",
          version: "1",
          details: { exactHash, expectedHash: asset.contentHash, semanticCheck: "NOT_AVAILABLE" },
        };
  }
  return db.assetScan.create({
    data: {
      workspaceId: context.workspaceId,
      assetId: asset.id,
      kind,
      status: result.status,
      scanner: result.scanner,
      version: result.version,
      details: json(result.details),
      idempotencyKey: key,
    },
  });
}

export async function runAssetGate(context: RequestContext, assetId: string) {
  const malware = await scanAsset(context, assetId, "MALWARE");
  const integrity = await scanAsset(context, assetId, "INTEGRITY");
  const asset = await db.asset.findFirst({
    where: { id: assetId, workspaceId: context.workspaceId, deletedAt: null },
    select: { mimeType: true, metadata: true },
  });
  if (!asset)
    throw new ApiError(404, "ASSET_NOT_FOUND", "The asset was not found in this workspace.");
  const metadata = record(asset.metadata);
  const requiresVisionGate =
    asset.mimeType.startsWith("image/") || asset.mimeType.startsWith("video/");
  const ocr = requiresVisionGate ? await scanAsset(context, assetId, "OCR") : null;
  const masking = requiresVisionGate ? await scanAsset(context, assetId, "MASKING") : null;
  const scans = [malware, integrity, ocr, masking].filter(Boolean);
  const blocked = scans.some(
    (scan) =>
      scan!.status === "FAILED" ||
      (process.env.NODE_ENV === "production" &&
        ["UNAVAILABLE", "REQUIRES_PROVIDER"].includes(scan!.status)),
  );
  if (blocked) {
    await db.asset.update({
      where: { id: assetId },
      data: {
        status: "QUARANTINED",
        metadata: json({
          safetyGate: "BLOCKED",
          malware: malware.status,
          integrity: integrity.status,
          ocr: ocr?.status ?? "NOT_REQUIRED",
          masking: masking?.status ?? "NOT_REQUIRED",
        }),
      },
    });
    throw new ApiError(
      422,
      "ASSET_SAFETY_GATE_FAILED",
      "The asset failed a required safety or integrity gate.",
      {
        malware: malware.status,
        integrity: integrity.status,
        ocr: ocr?.status,
        masking: masking?.status,
      },
    );
  }
  if (metadata.safetyGate === "BLOCKED")
    throw new ApiError(422, "ASSET_SAFETY_GATE_FAILED", "The asset is already quarantined.");
  return { malware, integrity, ocr, masking };
}

export async function runOptionalAssetScan(
  context: RequestContext,
  assetId: string,
  kind: "OCR" | "MASKING",
) {
  return scanAsset(context, assetId, kind);
}

export async function analyzeMediaAsset(context: RequestContext, assetId: string) {
  const asset = await db.asset.findFirst({
    where: { id: assetId, workspaceId: context.workspaceId, deletedAt: null },
  });
  if (!asset)
    throw new ApiError(404, "ASSET_NOT_FOUND", "The asset was not found in this workspace.");
  const existing = await db.mediaAnalysis.findUnique({
    where: { workspaceId_assetId: { workspaceId: context.workspaceId, assetId } },
  });
  if (existing?.status === "COMPLETED") return existing;
  const external = await optionalProvider(process.env.MEDIA_ANALYSIS_PROVIDER_URL, {
    assetId,
    objectKey: asset.objectKey,
    mimeType: asset.mimeType,
    contentHash: asset.contentHash,
  });
  let metadata: Record<string, unknown> = {};
  if (
    !external &&
    localStorageEnabled() &&
    (asset.mimeType.startsWith("video/") || asset.mimeType.startsWith("audio/"))
  ) {
    const object = await readLocalObject(asset.objectKey);
    const work = `${process.cwd()}\\.data\\analysis-${asset.id}`;
    const { writeFile, rm } = await import("node:fs/promises");
    await writeFile(`${work}.bin`, object.body);
    try {
      const probe = await execFileAsync(
        ffprobePath(),
        ["-v", "error", "-show_streams", "-show_format", "-of", "json", `${work}.bin`],
        { timeout: 60_000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      );
      metadata = JSON.parse(probe.stdout) as Record<string, unknown>;
    } catch (error) {
      metadata = { probeError: error instanceof Error ? error.message : "ffprobe failed" };
    } finally {
      await rm(`${work}.bin`, { force: true }).catch(() => undefined);
    }
  }
  const streams = Array.isArray(metadata.streams) ? metadata.streams : [];
  const format = record(metadata.format);
  const video = streams.find((stream) => record(stream).codec_type === "video");
  const audio = streams.find((stream) => record(stream).codec_type === "audio");
  const duration = Number(format.duration ?? 0);
  const result = external ?? {};
  return db.mediaAnalysis.upsert({
    where: { workspaceId_assetId: { workspaceId: context.workspaceId, assetId } },
    update: {
      status: external ? "COMPLETED" : "COMPLETED",
      provider: external ? String(result.provider ?? "configured-media-analysis") : "local-ffprobe",
      durationMs:
        Number.isFinite(duration) && duration > 0 ? Math.round(duration * 1000) : undefined,
      width: Number(record(video).width) || undefined,
      height: Number(record(video).height) || undefined,
      language: typeof result.language === "string" ? result.language : undefined,
      transcript: result.transcript ? json(result.transcript) : undefined,
      scenes: result.scenes ? json(result.scenes) : json([]),
      speakers: result.speakers
        ? json(result.speakers)
        : json({
            status: "UNAVAILABLE",
            reason: "Configure MEDIA_ANALYSIS_PROVIDER_URL for speaker detection.",
          }),
      faces: result.faces
        ? json(result.faces)
        : json({
            status: "UNAVAILABLE",
            reason: "Configure MEDIA_ANALYSIS_PROVIDER_URL for face detection.",
          }),
      warnings: json([
        ...(Array.isArray(result.warnings) ? result.warnings : []),
        ...(external
          ? []
          : [
              "Local analysis covers media streams and timing; transcription, faces, speakers, OCR, and semantic shot labels need a configured provider.",
            ]),
      ]),
      metadata: json({
        ...metadata,
        audioCodec: record(audio).codec_name,
        videoCodec: record(video).codec_name,
      }),
    },
    create: {
      workspaceId: context.workspaceId,
      assetId,
      status: "COMPLETED",
      provider: external ? String(result.provider ?? "configured-media-analysis") : "local-ffprobe",
      durationMs:
        Number.isFinite(duration) && duration > 0 ? Math.round(duration * 1000) : undefined,
      width: Number(record(video).width) || undefined,
      height: Number(record(video).height) || undefined,
      language: typeof result.language === "string" ? result.language : undefined,
      transcript: result.transcript ? json(result.transcript) : undefined,
      scenes: result.scenes ? json(result.scenes) : json([]),
      speakers: result.speakers ? json(result.speakers) : json({ status: "UNAVAILABLE" }),
      faces: result.faces ? json(result.faces) : json({ status: "UNAVAILABLE" }),
      warnings: json(Array.isArray(result.warnings) ? result.warnings : []),
      metadata: json({
        ...metadata,
        audioCodec: record(audio).codec_name,
        videoCodec: record(video).codec_name,
      }),
    },
  });
}
