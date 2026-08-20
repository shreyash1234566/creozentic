import {
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
  DeleteObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { ApiError } from "./api";
import { isReleaseMode } from "./runtime-config";

export class StorageNotConfiguredError extends ApiError {
  constructor() {
    super(
      503,
      "STORAGE_NOT_CONFIGURED",
      "Object storage is not configured. Set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY.",
    );
  }
}

function storageConfig() {
  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey)
    throw new StorageNotConfiguredError();
  return {
    endpoint,
    bucket,
    accessKeyId,
    secretAccessKey,
    region: process.env.S3_REGION ?? "auto",
  };
}

function hasRemoteStorage() {
  return Boolean(
    process.env.S3_ENDPOINT &&
    process.env.S3_BUCKET &&
    process.env.S3_ACCESS_KEY_ID &&
    process.env.S3_SECRET_ACCESS_KEY,
  );
}

export function localStorageEnabled() {
  if (process.env.LOCAL_STORAGE_ENABLED === "true") return true;
  return !isReleaseMode() && process.env.NODE_ENV !== "production" && !hasRemoteStorage();
}

function localRoot() {
  return resolve(
    /* turbopackIgnore: true */ process.env.LOCAL_STORAGE_ROOT ??
      join(process.cwd(), ".data", "objects"),
  );
}

function localPath(objectKey: string) {
  if (!objectKey || objectKey.includes("\\") || objectKey.includes(".."))
    throw new ApiError(400, "INVALID_OBJECT_KEY", "The storage object key is invalid.");
  const root = localRoot();
  const target = resolve(root, objectKey);
  const outside = relative(root, target);
  if (outside.startsWith("..") || isAbsolute(outside))
    throw new ApiError(
      400,
      "INVALID_OBJECT_KEY",
      "The storage object key is outside local storage.",
    );
  return target;
}

function signingSecret() {
  return (
    process.env.LOCAL_STORAGE_SIGNING_SECRET ??
    process.env.AUTH_SESSION_SECRET ??
    "local-storage-secret"
  );
}

function signLocalObject(objectKey: string, expiresAt: number) {
  return createHmac("sha256", signingSecret())
    .update(`${objectKey}:${expiresAt}`)
    .digest("base64url");
}

export function verifyLocalObjectSignature(
  objectKey: string,
  expiresAtValue: string,
  supplied: string,
) {
  const expiresAt = Number(expiresAtValue);
  if (!Number.isSafeInteger(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return false;
  const expected = Buffer.from(signLocalObject(objectKey, expiresAt));
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function writeLocalObject(objectKey: string, body: Uint8Array, mimeType?: string) {
  if (!localStorageEnabled()) throw new StorageNotConfiguredError();
  const target = localPath(objectKey);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, body);
  await writeFile(`${target}.meta.json`, JSON.stringify({ mimeType }), "utf8");
  return { byteSize: body.byteLength, mimeType };
}

export async function writeObject(objectKey: string, body: Uint8Array, mimeType?: string) {
  if (localStorageEnabled()) return writeLocalObject(objectKey, body, mimeType);
  const config = storageConfig();
  await storageClient(config).send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
      Body: body,
      ContentType: mimeType,
    }),
  );
  return { byteSize: body.byteLength, mimeType };
}

export async function readLocalObject(objectKey: string) {
  if (!localStorageEnabled()) throw new StorageNotConfiguredError();
  const target = localPath(objectKey);
  const [body, metadata] = await Promise.all([
    readFile(/* turbopackIgnore: true */ target),
    readFile(`${target}.meta.json`, "utf8").catch(() => "{}"),
  ]);
  let mimeType: string | undefined;
  try {
    const parsed = JSON.parse(metadata) as { mimeType?: unknown };
    mimeType = typeof parsed.mimeType === "string" ? parsed.mimeType : undefined;
  } catch {
    mimeType = undefined;
  }
  return { body, mimeType };
}

export async function readObject(objectKey: string) {
  if (localStorageEnabled()) return readLocalObject(objectKey);
  const config = storageConfig();
  const response = await storageClient(config).send(
    new GetObjectCommand({ Bucket: config.bucket, Key: objectKey }),
  );
  const body = response.Body
    ? Buffer.from(await response.Body.transformToByteArray())
    : Buffer.alloc(0);
  return { body, mimeType: response.ContentType };
}

function storageClient(config: ReturnType<typeof storageConfig>) {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
}

export async function createUploadIntent(input: {
  objectKey: string;
  mimeType: string;
  byteSize?: number;
}) {
  if (localStorageEnabled()) {
    const expiresIn = 900;
    const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
    const token = signLocalObject(input.objectKey, expiresAt);
    const uploadUrl = `/api/v1/storage/object?key=${encodeURIComponent(input.objectKey)}&expires=${expiresAt}&token=${encodeURIComponent(token)}`;
    return { uploadUrl, bucket: "local", expiresIn };
  }
  const config = storageConfig();
  const client = storageClient(config);
  const expiresIn = 900;
  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: input.objectKey,
      ContentType: input.mimeType,
      ContentLength: input.byteSize,
    }),
    { expiresIn },
  );
  return { uploadUrl, bucket: config.bucket, expiresIn };
}

export async function verifyUploadedObject(input: {
  objectKey: string;
  expectedByteSize?: number;
}) {
  if (localStorageEnabled()) {
    const object = await readLocalObject(input.objectKey);
    if (input.expectedByteSize !== undefined && object.body.byteLength !== input.expectedByteSize)
      throw new Error("Uploaded object size does not match the declared byte size.");
    return { byteSize: object.body.byteLength, mimeType: object.mimeType };
  }
  const config = storageConfig();
  const head = await storageClient(config).send(
    new HeadObjectCommand({ Bucket: config.bucket, Key: input.objectKey }),
  );
  if (input.expectedByteSize !== undefined && head.ContentLength !== input.expectedByteSize)
    throw new Error("Uploaded object size does not match the declared byte size.");
  return { byteSize: head.ContentLength, mimeType: head.ContentType };
}

export async function createDownloadUrl(input: { objectKey: string; expiresIn?: number }) {
  if (localStorageEnabled()) {
    const expiresIn = Math.min(Math.max(input.expiresIn ?? 900, 60), 3600);
    const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
    const token = signLocalObject(input.objectKey, expiresAt);
    return {
      url: `/api/v1/storage/object?key=${encodeURIComponent(input.objectKey)}&expires=${expiresAt}&token=${encodeURIComponent(token)}`,
      expiresIn,
    };
  }
  const config = storageConfig();
  const expiresIn = Math.min(Math.max(input.expiresIn ?? 900, 60), 3600);
  const url = await getSignedUrl(
    storageClient(config),
    new GetObjectCommand({ Bucket: config.bucket, Key: input.objectKey }),
    { expiresIn },
  );
  return { url, expiresIn };
}

export async function deleteObject(objectKey: string) {
  if (localStorageEnabled()) {
    const target = localPath(objectKey);
    await Promise.all(
      [target, `${target}.meta.json`].map((file) =>
        unlink(file).catch((error: unknown) => {
          if ((error as { code?: string }).code !== "ENOENT") throw error;
        }),
      ),
    );
    return;
  }
  const config = storageConfig();
  await storageClient(config).send(
    new DeleteObjectCommand({ Bucket: config.bucket, Key: objectKey }),
  );
}

export function objectKeyFor(workspaceId: string, assetId: string, name: string) {
  const safeName = name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "asset";
  return `workspaces/${workspaceId}/assets/${assetId}/${safeName}`;
}

export function isWorkspaceObjectKey(workspaceId: string, objectKey: string) {
  return objectKey.startsWith(`workspaces/${workspaceId}/`);
}
