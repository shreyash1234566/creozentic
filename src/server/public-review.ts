import { createHash } from "node:crypto";
import { ApiError } from "./api";
import { enforceRateLimit } from "./rate-limit";

function clientAddress(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

export async function limitPublicReviewRequest(
  request: Request,
  token: string,
  action: "view" | "comment" | "decision",
) {
  const tokenKey = createHash("sha256").update(token).digest("hex").slice(0, 20);
  const policy =
    action === "view"
      ? { limit: 60, seconds: 60 }
      : action === "comment"
        ? { limit: 12, seconds: 600 }
        : { limit: 6, seconds: 3600 };
  return enforceRateLimit(
    `public-review:${action}:${tokenKey}:${clientAddress(request)}`,
    policy.limit,
    policy.seconds,
  );
}

export async function readBoundedPublicJson(request: Request, maxBytes = 16 * 1024) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes)
    throw new ApiError(413, "REVIEW_REQUEST_TOO_LARGE", "The review request body is too large.");
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > maxBytes)
    throw new ApiError(413, "REVIEW_REQUEST_TOO_LARGE", "The review request body is too large.");
  try {
    return (raw ? JSON.parse(raw) : {}) as Record<string, unknown>;
  } catch {
    throw new ApiError(
      400,
      "INVALID_REVIEW_REQUEST",
      "The review request must contain valid JSON.",
    );
  }
}
