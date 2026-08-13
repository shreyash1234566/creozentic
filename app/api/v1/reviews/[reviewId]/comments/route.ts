import { NextResponse } from "next/server";
import { getRequestContext, requireRole } from "../../../../../../src/server/auth";
import { ApiError, jsonError } from "../../../../../../src/server/api";
import { db } from "../../../../../../src/server/db";
import {
  normalizeMentions,
  normalizeReviewAnchor,
  reviewCommentJson,
} from "../../../../../../src/server/review-comments";

export async function GET(request: Request, { params }: { params: Promise<{ reviewId: string }> }) {
  try {
    const context = await getRequestContext(request);
    const { reviewId } = await params;
    const review = await db.reviewTask.findFirst({
      where: { id: reviewId, workspaceId: context.workspaceId },
      select: { id: true, comments: { orderBy: { createdAt: "asc" } } },
    });
    if (!review)
      throw new ApiError(
        404,
        "REVIEW_NOT_FOUND",
        "The review task was not found in this workspace.",
      );
    return NextResponse.json({ data: review.comments });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ reviewId: string }> },
) {
  try {
    const context = await getRequestContext(request);
    requireRole(context, "REVIEWER");
    const { reviewId } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const region = typeof body.region === "string" ? body.region.trim() : undefined;
    const anchor = normalizeReviewAnchor(body.anchor);
    const mentions = normalizeMentions(body.mentions);
    const parentId = typeof body.parentId === "string" ? body.parentId : undefined;
    if (!text || text.length > 4000)
      throw new ApiError(400, "INVALID_COMMENT", "Comment text must contain 1 to 4000 characters.");
    const review = await db.reviewTask.findFirst({
      where: { id: reviewId, workspaceId: context.workspaceId },
      select: { id: true, runId: true },
    });
    if (!review)
      throw new ApiError(
        404,
        "REVIEW_NOT_FOUND",
        "The review task was not found in this workspace.",
      );
    const assetId = typeof body.assetId === "string" ? body.assetId : undefined;
    if (assetId) {
      const output = await db.outputAsset.findFirst({
        where: {
          workspaceId: context.workspaceId,
          runId: review.runId,
          OR: [{ id: assetId }, { assetId }],
        },
        select: { id: true },
      });
      if (!output)
        throw new ApiError(
          404,
          "ASSET_NOT_IN_REVIEW",
          "The asset is not part of this review task.",
        );
    }
    if (parentId) {
      const parent = await db.comment.findFirst({
        where: { id: parentId, reviewTaskId: review.id },
        select: { id: true },
      });
      if (!parent)
        throw new ApiError(
          404,
          "COMMENT_PARENT_NOT_FOUND",
          "The parent comment is not in this review.",
        );
    }
    if (mentions.length) {
      const matchingMembers = await db.membership.count({
        where: { workspaceId: context.workspaceId, userId: { in: mentions }, status: "ACTIVE" },
      });
      if (matchingMembers !== mentions.length)
        throw new ApiError(
          404,
          "COMMENT_MENTION_NOT_FOUND",
          "Every mentioned user must be an active workspace member.",
        );
    }
    const comment = await db.comment.create({
      data: {
        reviewTaskId: review.id,
        authorId: context.userId,
        assetId,
        region,
        anchor: anchor ? reviewCommentJson(anchor) : undefined,
        mentions: mentions.length ? reviewCommentJson(mentions) : undefined,
        parentId,
        text,
      },
    });
    await db.auditEvent.create({
      data: {
        workspaceId: context.workspaceId,
        actorId: context.userId,
        action: "review.comment.created",
        targetType: "review_task",
        targetId: review.id,
        correlationId: context.correlationId,
        metadata: { commentId: comment.id, assetId, region, anchor, mentions, parentId },
      },
    });
    return NextResponse.json({ data: comment }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
