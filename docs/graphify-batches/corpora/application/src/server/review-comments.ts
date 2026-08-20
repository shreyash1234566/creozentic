import { Prisma } from "@prisma/client";
import { ApiError } from "./api";

export type ReviewCommentAnchor = {
  kind: "image_region" | "video_timestamp" | "text_line";
  timestampMs?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  line?: number;
};

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

export function normalizeReviewAnchor(value: unknown): ReviewCommentAnchor | undefined {
  if (value === undefined || value === null) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ApiError(400, "INVALID_COMMENT_ANCHOR", "Comment anchor must be an object.");
  const anchor = value as Record<string, unknown>;
  const kind = anchor.kind;
  if (kind !== "image_region" && kind !== "video_timestamp" && kind !== "text_line")
    throw new ApiError(
      400,
      "INVALID_COMMENT_ANCHOR",
      "Comment anchor kind must be image_region, video_timestamp, or text_line.",
    );
  if (kind === "image_region") {
    const values = [anchor.x, anchor.y, anchor.width, anchor.height];
    if (!values.every(finite) || values.some((item) => Number(item) < 0 || Number(item) > 100))
      throw new ApiError(
        400,
        "INVALID_COMMENT_ANCHOR",
        "Image-region anchors need x, y, width, and height percentages between 0 and 100.",
      );
    return {
      kind,
      x: Number(anchor.x),
      y: Number(anchor.y),
      width: Number(anchor.width),
      height: Number(anchor.height),
    };
  }
  if (kind === "video_timestamp") {
    if (!finite(anchor.timestampMs) || Number(anchor.timestampMs) < 0)
      throw new ApiError(
        400,
        "INVALID_COMMENT_ANCHOR",
        "Video anchors require a non-negative timestampMs.",
      );
    return { kind, timestampMs: Math.floor(Number(anchor.timestampMs)) };
  }
  if (!Number.isInteger(anchor.line) || Number(anchor.line) < 1)
    throw new ApiError(
      400,
      "INVALID_COMMENT_ANCHOR",
      "Text-line anchors require a positive line number.",
    );
  return { kind, line: Number(anchor.line) };
}

export function normalizeMentions(value: unknown) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
    throw new ApiError(
      400,
      "INVALID_COMMENT_MENTIONS",
      "Comment mentions must be an array of user IDs.",
    );
  const mentions = [...new Set(value.map((item) => item.trim()).filter(Boolean))];
  if (mentions.length > 20)
    throw new ApiError(400, "INVALID_COMMENT_MENTIONS", "A comment may mention at most 20 users.");
  return mentions;
}

export function reviewCommentJson(value: unknown) {
  return value as Prisma.InputJsonValue;
}
