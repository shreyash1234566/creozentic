import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ApiError } from "./api";

function encryptionKey() {
  const raw = process.env.CONNECTION_ENCRYPTION_KEY;
  if (!raw)
    throw new ApiError(
      503,
      "CONNECTION_ENCRYPTION_NOT_CONFIGURED",
      "CONNECTION_ENCRYPTION_KEY is required for connector secrets.",
    );
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32)
    throw new ApiError(
      500,
      "CONNECTION_ENCRYPTION_INVALID",
      "CONNECTION_ENCRYPTION_KEY must decode to 32 bytes.",
    );
  return key;
}

export function encryptConnectionSecret(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${ciphertext.toString("base64url")}`;
}

export function decryptConnectionSecret(value: string) {
  const [version, ivEncoded, tagEncoded, ciphertextEncoded] = value.split(":");
  if (version !== "v1" || !ivEncoded || !tagEncoded || !ciphertextEncoded)
    throw new ApiError(500, "CONNECTION_SECRET_INVALID", "The stored connector secret is invalid.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivEncoded, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(ciphertextEncoded, "base64url")),
      decipher.final(),
    ]).toString("utf8"),
  ) as { accessToken: string; refreshToken?: string };
}
