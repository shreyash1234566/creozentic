import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { ApiError } from "./api";
import { db } from "./db";
import { usableConnectionAccessToken } from "./connector-oauth";
import {
  createDownloadUrl,
  isWorkspaceObjectKey,
  objectKeyFor,
  readObject,
  StorageNotConfiguredError,
  verifyUploadedObject,
  writeObject,
} from "./storage";
import { requireRole, type RequestContext } from "./auth";
import { providerApiError, requestProvider } from "./provider-http";

type DriveFileInput = {
  externalFileId?: unknown;
  name?: unknown;
  contentHash?: unknown;
  mimeType?: unknown;
  objectKey?: unknown;
  assetId?: unknown;
  metadata?: unknown;
};

function json(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function providerKey(provider: string) {
  return `CONNECTOR_${provider.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_SYNC_URL`;
}

function asFiles(value: unknown) {
  if (!Array.isArray(value)) return [] as DriveFileInput[];
  return value.filter((item): item is DriveFileInput =>
    Boolean(item && typeof item === "object" && !Array.isArray(item)),
  );
}

function string(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function driveFileLimit() {
  const configured = Number(process.env.GOOGLE_DRIVE_MAX_FILE_BYTES ?? 100 * 1024 * 1024);
  return Number.isFinite(configured)
    ? Math.min(Math.max(Math.floor(configured), 1_024), 2 * 1024 * 1024 * 1024)
    : 100 * 1024 * 1024;
}

async function downloadGoogleFile(input: {
  accessToken: string;
  fileId: string;
  name: string;
  mimeType: string;
  workspaceId: string;
  byteSize?: number;
}) {
  const limit = driveFileLimit();
  if (input.byteSize && input.byteSize > limit)
    throw new ApiError(
      413,
      "DRIVE_FILE_TOO_LARGE",
      `Google Drive file ${input.name} exceeds the configured download limit.`,
    );
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(input.fileId)}?alt=media`,
    { headers: { authorization: `Bearer ${input.accessToken}` } },
  );
  if (!response.ok)
    throw new Error(`Google Drive download failed with HTTP ${response.status} for ${input.name}.`);
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > limit)
    throw new ApiError(
      413,
      "DRIVE_FILE_TOO_LARGE",
      `Google Drive file ${input.name} exceeds the configured download limit.`,
    );
  const body = Buffer.from(await response.arrayBuffer());
  if (body.byteLength > limit)
    throw new ApiError(
      413,
      "DRIVE_FILE_TOO_LARGE",
      `Google Drive file ${input.name} exceeds the configured download limit.`,
    );
  const objectKey = objectKeyFor(input.workspaceId, `drive-${input.fileId}`, input.name);
  const mimeType = response.headers.get("content-type")?.split(";")[0] || input.mimeType;
  await writeObject(objectKey, body, mimeType);
  return {
    externalFileId: input.fileId,
    name: input.name,
    contentHash: createHash("sha256").update(body).digest("hex"),
    mimeType,
    objectKey,
    metadata: { provider: "google-drive", byteSize: body.byteLength },
  } satisfies DriveFileInput;
}

async function nativeGoogleDriveSync(input: {
  direction: "PULL" | "PUSH";
  inputFolderId?: string;
  outputFolderId?: string;
  outputPayload?: Array<{
    outputAssetId: string;
    name?: string | null;
    objectKey?: string | null;
    contentHash?: string | null;
    mimeType?: string | null;
    assetId?: string | null;
    format?: string | null;
  }>;
  accessToken: string;
  workspaceId: string;
  idempotencyKey: string;
}) {
  if (input.direction === "PULL") {
    const files: DriveFileInput[] = [];
    let pageToken = "";
    do {
      const query = new URLSearchParams({
        q: `'${input.inputFolderId}' in parents and trashed = false`,
        pageSize: "100",
        fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime,md5Checksum)",
        ...(pageToken ? { pageToken } : {}),
      });
      const response = await requestProvider<unknown>({
        provider: "google-drive",
        endpoint: `https://www.googleapis.com/drive/v3/files?${query.toString()}`,
        method: "GET",
        headers: { authorization: `Bearer ${input.accessToken}` },
        idempotencyKey: input.idempotencyKey,
      });
      const body = record(response.body);
      const remoteFiles = Array.isArray(body.files) ? body.files : [];
      for (const candidate of remoteFiles) {
        const item = record(candidate);
        const fileId = string(item.id);
        const name = string(item.name);
        const mimeType = string(item.mimeType);
        // Google Workspace documents require a deliberate export format and must never be
        // silently converted into a misleading binary asset.
        if (!fileId || !name || !mimeType || mimeType.startsWith("application/vnd.google-apps."))
          continue;
        files.push(
          await downloadGoogleFile({
            accessToken: input.accessToken,
            fileId,
            name,
            mimeType,
            workspaceId: input.workspaceId,
            byteSize: Number(item.size) || undefined,
          }),
        );
      }
      pageToken = string(body.nextPageToken);
    } while (pageToken && files.length < 1_000);
    return { mode: "native-google-drive", files };
  }

  const files: DriveFileInput[] = [];
  for (const output of input.outputPayload ?? []) {
    if (!output.objectKey || !output.name || !output.contentHash) continue;
    const stored = await readObject(output.objectKey);
    const mimeType = output.mimeType ?? stored.mimeType ?? "application/octet-stream";
    const form = new FormData();
    form.set(
      "metadata",
      new Blob([JSON.stringify({ name: output.name, parents: [input.outputFolderId] })], {
        type: "application/json",
      }),
    );
    form.set("file", new Blob([stored.body], { type: mimeType }), output.name);
    const response = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${input.accessToken}`,
          "x-goog-request-id": input.idempotencyKey,
        },
        body: form,
      },
    );
    if (!response.ok)
      throw new Error(
        `Google Drive upload failed with HTTP ${response.status} for ${output.name}.`,
      );
    const uploaded = record(await response.json());
    files.push({
      externalFileId: string(uploaded.id),
      name: string(uploaded.name) || output.name,
      contentHash: output.contentHash,
      mimeType: string(uploaded.mimeType) || mimeType,
      objectKey: output.objectKey,
      assetId: output.assetId,
      metadata: { provider: "google-drive", remoteSize: string(uploaded.size) || null },
    });
  }
  return { mode: "native-google-drive", files };
}

async function failJob(jobId: string, message: string, code = "DRIVE_SYNC_FAILED") {
  return db.driveSyncJob.update({
    where: { id: jobId },
    data: { status: "FAILED", error: { code, message } },
  });
}

export async function createDriveSync(
  context: RequestContext,
  input: {
    provider: string;
    direction: "PULL" | "PUSH";
    inputFolderId?: string;
    outputFolderId?: string;
    assetIds?: string[];
    outputAssetIds?: string[];
    idempotencyKey: string;
  },
) {
  requireRole(context, "EDITOR");
  const provider = input.provider.trim().toLowerCase();
  if (provider !== "google-drive")
    throw new ApiError(
      400,
      "UNSUPPORTED_DRIVE_PROVIDER",
      "Only the google-drive connector supports Drive sync.",
    );
  if (input.direction === "PULL" && !input.inputFolderId)
    throw new ApiError(400, "DRIVE_FOLDER_REQUIRED", "inputFolderId is required for a pull sync.");
  if (input.direction === "PUSH" && (!input.outputFolderId || !input.outputAssetIds?.length))
    throw new ApiError(
      400,
      "DRIVE_OUTPUT_REQUIRED",
      "outputFolderId and outputAssetIds are required for a push sync.",
    );
  const connection = await db.connection.findFirst({
    where: { workspaceId: context.workspaceId, provider, health: { in: ["HEALTHY", "EXPIRING"] } },
  });
  if (!connection)
    throw new ApiError(
      409,
      "CONNECTION_NOT_HEALTHY",
      "Connect a healthy Google Drive account first.",
    );
  const existing = await db.driveSyncJob.findUnique({
    where: {
      workspaceId_idempotencyKey: {
        workspaceId: context.workspaceId,
        idempotencyKey: input.idempotencyKey,
      },
    },
    include: { files: true },
  });
  if (existing) return { job: existing, deduplicated: true };
  if (input.direction === "PUSH") {
    const outputs = await db.outputAsset.findMany({
      where: {
        workspaceId: context.workspaceId,
        id: { in: input.outputAssetIds },
        status: { in: ["APPROVED", "EXPORTED"] },
      },
      include: { asset: true },
    });
    if (outputs.length !== input.outputAssetIds!.length)
      throw new ApiError(
        409,
        "DRIVE_OUTPUT_APPROVAL_REQUIRED",
        "Every Drive output must be approved or exported and belong to this workspace.",
      );
    if (outputs.some((output) => !output.asset?.objectKey))
      throw new ApiError(
        409,
        "OUTPUT_NOT_RETRIEVABLE",
        "Every Drive output must have a retrievable object.",
      );
    if (
      outputs.some(
        (output) =>
          !output.asset || !isWorkspaceObjectKey(context.workspaceId, output.asset.objectKey),
      )
    )
      throw new ApiError(
        409,
        "OUTPUT_NOT_RETRIEVABLE",
        "Every Drive output must remain inside the workspace storage namespace.",
      );
  }
  const job = await db.driveSyncJob.create({
    data: {
      workspaceId: context.workspaceId,
      connectionId: connection.id,
      createdBy: context.userId,
      direction: input.direction,
      inputFolderId: input.inputFolderId,
      outputFolderId: input.outputFolderId,
      idempotencyKey: input.idempotencyKey,
    },
  });
  const endpoint = process.env[providerKey(provider)];
  try {
    const accessToken = await usableConnectionAccessToken(connection.id, context.workspaceId);
    const outputPayload =
      input.direction === "PUSH"
        ? await Promise.all(
            (input.outputAssetIds ?? []).map(async (outputAssetId) => {
              const output = await db.outputAsset.findFirst({
                where: { id: outputAssetId, workspaceId: context.workspaceId },
                include: { asset: true },
              });
              let downloadUrl: string | null = null;
              try {
                downloadUrl = output?.asset?.objectKey
                  ? (await createDownloadUrl({ objectKey: output.asset.objectKey, expiresIn: 900 }))
                      .url
                  : null;
              } catch (error) {
                if (!(error instanceof StorageNotConfiguredError)) throw error;
              }
              return {
                outputAssetId,
                name: output?.name,
                objectKey: output?.asset?.objectKey,
                contentHash: output?.asset?.contentHash ?? null,
                mimeType: output?.asset?.mimeType ?? null,
                assetId: output?.asset?.id ?? null,
                downloadUrl,
                format: output?.format,
                metadata: output?.metadata,
              };
            }),
          )
        : undefined;
    const body = endpoint
      ? record(
          (
            await requestProvider<unknown>({
              provider: "google-drive",
              endpoint,
              headers: { authorization: `Bearer ${accessToken}` },
              idempotencyKey: input.idempotencyKey,
              body: {
                direction: input.direction,
                inputFolderId: input.inputFolderId,
                outputFolderId: input.outputFolderId,
                files: outputPayload,
              },
            })
          ).body,
        )
      : await nativeGoogleDriveSync({
          direction: input.direction,
          inputFolderId: input.inputFolderId,
          outputFolderId: input.outputFolderId,
          outputPayload,
          accessToken,
          workspaceId: context.workspaceId,
          idempotencyKey: input.idempotencyKey,
        });
    const files = asFiles(body.files);
    const result = await db.$transaction(async (tx) => {
      let changed = 0;
      let skipped = 0;
      for (const item of files) {
        const externalFileId =
          typeof item.externalFileId === "string" ? item.externalFileId.trim() : "";
        const name = typeof item.name === "string" ? item.name.trim() : "";
        const contentHash = typeof item.contentHash === "string" ? item.contentHash.trim() : "";
        const mimeType = typeof item.mimeType === "string" ? item.mimeType.trim() : "";
        if (!externalFileId || !name || !contentHash || !mimeType) continue;
        const existingFile = await tx.driveFile.findUnique({
          where: { connectionId_externalFileId: { connectionId: connection.id, externalFileId } },
        });
        const same = existingFile?.contentHash === contentHash;
        const objectKey =
          typeof item.objectKey === "string" ? item.objectKey : existingFile?.objectKey;
        if (objectKey && !isWorkspaceObjectKey(context.workspaceId, objectKey))
          throw new Error("Drive adapter returned an object key outside the workspace namespace.");
        if (input.direction === "PULL" && !objectKey)
          throw new Error("Drive pull returned a file without a workspace object key.");
        if (input.direction === "PULL" && objectKey) await verifyUploadedObject({ objectKey });
        let assetId = typeof item.assetId === "string" ? item.assetId : existingFile?.assetId;
        if (assetId) {
          const asset = await tx.asset.findFirst({
            where: { id: assetId, workspaceId: context.workspaceId, deletedAt: null },
            select: { id: true, objectKey: true },
          });
          if (!asset) throw new Error("Drive adapter returned an asset from another workspace.");
          if (!isWorkspaceObjectKey(context.workspaceId, asset.objectKey))
            throw new Error("Drive adapter referenced an asset outside the workspace namespace.");
        } else if (input.direction === "PULL" && objectKey) {
          const existingAsset = await tx.asset.findUnique({
            where: { workspaceId_contentHash: { workspaceId: context.workspaceId, contentHash } },
            select: { id: true },
          });
          if (existingAsset) {
            assetId = existingAsset.id;
          } else {
            const createdAsset = await tx.asset.create({
              data: {
                workspaceId: context.workspaceId,
                type: "ORIGINAL",
                status: "IMMUTABLE",
                name,
                objectKey,
                contentHash,
                mimeType,
                metadata:
                  item.metadata && typeof item.metadata === "object"
                    ? json(item.metadata)
                    : undefined,
              },
              select: { id: true },
            });
            assetId = createdAsset.id;
          }
        }
        await tx.driveFile.upsert({
          where: { connectionId_externalFileId: { connectionId: connection.id, externalFileId } },
          update: {
            syncJobId: job.id,
            name,
            contentHash,
            mimeType,
            objectKey,
            assetId,
            status: same ? "SKIPPED_UNCHANGED" : "SYNCED",
            metadata:
              item.metadata && typeof item.metadata === "object" ? json(item.metadata) : undefined,
            lastSeenAt: new Date(),
          },
          create: {
            workspaceId: context.workspaceId,
            connectionId: connection.id,
            syncJobId: job.id,
            externalFileId,
            direction: input.direction,
            name,
            contentHash,
            mimeType,
            objectKey,
            assetId,
            metadata:
              item.metadata && typeof item.metadata === "object" ? json(item.metadata) : undefined,
            status: "SYNCED",
          },
        });
        if (same) skipped += 1;
        else changed += 1;
      }
      const updated = await tx.driveSyncJob.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          fileCount: files.length,
          manifest: json({
            provider,
            direction: input.direction,
            changed,
            skipped,
            fileCount: files.length,
            adapter: body,
          }),
        },
        include: { files: true },
      });
      return { job: updated, changed, skipped };
    });
    return { ...result, deduplicated: false };
  } catch (error) {
    await failJob(
      job.id,
      error instanceof Error ? error.message : "The Drive sync adapter failed.",
    );
    const providerError = providerApiError(
      error,
      "DRIVE_SYNC_FAILED",
      "The Drive sync adapter failed.",
    );
    throw new ApiError(providerError.status, providerError.code, providerError.message, {
      jobId: job.id,
      ...((providerError.details as Record<string, unknown> | undefined) ?? {}),
    });
  }
}

export async function listDriveSyncJobs(context: RequestContext) {
  requireRole(context, "EDITOR");
  return db.driveSyncJob.findMany({
    where: { workspaceId: context.workspaceId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { files: true },
  });
}
