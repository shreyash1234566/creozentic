import { createHash, randomBytes } from "node:crypto";
import { ApiError } from "./api";
import { db } from "./db";
import type { RequestContext } from "./auth";
import { NodeState, RunState, ReviewStatus } from "@prisma/client";
import { createDownloadUrl, StorageNotConfiguredError } from "./storage";
import { createNotifications } from "./notifications";
import { workflowReviewAndExportKeys } from "./workflow-catalog";
import {
  normalizeMentions,
  normalizeReviewAnchor,
  reviewCommentJson,
  type ReviewCommentAnchor,
} from "./review-comments";

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createReviewLink(
  context: RequestContext,
  reviewTaskId: string,
  input: { expiresInHours?: number; maxViews?: number },
) {
  const review = await db.reviewTask.findFirst({
    where: { id: reviewTaskId, workspaceId: context.workspaceId },
    select: { id: true },
  });
  if (!review)
    throw new ApiError(404, "REVIEW_NOT_FOUND", "The review task was not found in this workspace.");
  const token = randomBytes(32).toString("base64url");
  const expiresInHours = Math.min(Math.max(Math.floor(input.expiresInHours ?? 24), 1), 168);
  const maxViews = Math.min(Math.max(Math.floor(input.maxViews ?? 10), 1), 1000);
  const expiresAt = new Date(Date.now() + expiresInHours * 3600000);
  await db.reviewLink.create({
    data: {
      workspaceId: context.workspaceId,
      reviewTaskId: review.id,
      tokenHash: tokenHash(token),
      expiresAt,
      maxViews,
    },
  });
  return {
    token,
    url: `${process.env.APP_URL ?? "http://localhost:3000"}/review/${token}`,
    expiresAt,
  };
}

export async function readReviewLink(token: string) {
  if (!token || token.length < 20)
    throw new ApiError(404, "REVIEW_LINK_NOT_FOUND", "The review link is invalid.");
  const linkForView = await db.$transaction(async (tx) => {
    const link = await tx.reviewLink.findUnique({ where: { tokenHash: tokenHash(token) } });
    if (!link || link.revokedAt || link.expiresAt <= new Date() || link.views >= link.maxViews)
      return null;
    const updated = await tx.reviewLink.updateMany({
      where: { id: link.id, views: link.views },
      data: { views: { increment: 1 } },
    });
    return updated.count === 1 ? link : null;
  });
  if (!linkForView)
    throw new ApiError(
      410,
      "REVIEW_LINK_EXPIRED",
      "This review link has expired, been revoked, or reached its view limit.",
    );
  const link = await db.reviewLink.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: {
      reviewTask: {
        include: {
          comments: true,
          run: { include: { outputs: { include: { asset: true } } } },
        },
      },
    },
  });
  if (!link) throw new ApiError(404, "REVIEW_LINK_NOT_FOUND", "The review link is invalid.");
  const outputs = [] as Array<Record<string, unknown>>;
  for (const output of link.reviewTask.run.outputs) {
    if (!output.asset || output.asset.workspaceId !== link.workspaceId) continue;
    const item: Record<string, unknown> = {
      id: output.id,
      name: output.name,
      format: output.format,
      width: output.width,
      height: output.height,
      status: output.status,
    };
    try {
      item.downloadUrl = (
        await createDownloadUrl({ objectKey: output.asset.objectKey, expiresIn: 900 })
      ).url;
    } catch (error) {
      if (!(error instanceof StorageNotConfiguredError)) throw error;
      item.downloadUrl = null;
    }
    outputs.push(item);
  }
  return {
    id: link.reviewTask.id,
    title: link.reviewTask.title,
    status: link.reviewTask.status,
    verdicts: link.reviewTask.verdicts,
    outputs,
    comments: link.reviewTask.comments.map((comment) => ({
      id: comment.id,
      text: comment.text,
      region: comment.region,
      anchor: comment.anchor,
      mentions: comment.mentions,
      parentId: comment.parentId,
      createdAt: comment.createdAt,
    })),
  };
}

export async function decideReviewLink(
  token: string,
  input: { decision: "approve" | "reject" | "refine"; reason?: string; reviewerName?: string },
) {
  const hash = tokenHash(token);
  const link = await db.reviewLink.findUnique({
    where: { tokenHash: hash },
    select: {
      id: true,
      workspaceId: true,
      reviewTaskId: true,
      expiresAt: true,
      revokedAt: true,
      views: true,
      maxViews: true,
    },
  });
  if (!link || link.revokedAt || link.expiresAt <= new Date() || link.views >= link.maxViews)
    throw new ApiError(410, "REVIEW_LINK_EXPIRED", "This review link has expired or been revoked.");
  const result = await db.$transaction(async (tx) => {
    const review = await tx.reviewTask.findFirst({
      where: { id: link.reviewTaskId, workspaceId: link.workspaceId },
      include: { run: { include: { workflowVersion: true } } },
    });
    if (!review) throw new ApiError(404, "REVIEW_NOT_FOUND", "The review task was not found.");
    if (review.status === ReviewStatus.APPROVED || review.status === ReviewStatus.REJECTED)
      return { review, run: review.run, duplicate: true };
    const verdicts = review.verdicts as Record<string, { verdict?: string }>;
    const blocked = Object.values(verdicts).some((value) => value?.verdict === "critical");
    if (input.decision === "approve" && blocked)
      throw new ApiError(
        409,
        "QUALITY_GATE_BLOCKED",
        "A critical quality check must be repaired before approval.",
      );
    const nextStatus =
      input.decision === "approve"
        ? ReviewStatus.APPROVED
        : input.decision === "reject"
          ? ReviewStatus.REJECTED
          : ReviewStatus.REFINEMENT_REQUESTED;
    const nextRunState =
      input.decision === "approve"
        ? RunState.APPROVED
        : input.decision === "reject"
          ? RunState.RETRYABLE_FAILURE
          : RunState.AWAITING_REVIEW;
    const decision = {
      action: input.decision,
      reason: input.reason ?? null,
      reviewerName: input.reviewerName ?? "External reviewer",
      at: new Date().toISOString(),
    };
    const updatedReview = await tx.reviewTask.update({
      where: { id: review.id },
      data: { status: nextStatus, decision },
    });
    const updatedRun = await tx.workflowRun.update({
      where: { id: review.runId },
      data: { state: nextRunState },
    });
    const controlKeys = workflowReviewAndExportKeys(review.run.workflowVersion.graph);
    if (controlKeys.review.length)
      await tx.nodeRun.updateMany({
        where: { runId: review.runId, nodeKey: { in: controlKeys.review } },
        data: { state: NodeState.SUCCEEDED, completedAt: new Date() },
      });
    if (input.decision === "approve" && controlKeys.export.length)
      await tx.nodeRun.updateMany({
        where: { runId: review.runId, nodeKey: { in: controlKeys.export } },
        data: { state: NodeState.QUEUED, completedAt: null },
      });
    if (input.decision === "approve")
      await tx.outputAsset.updateMany({
        where: { runId: review.runId, workspaceId: link.workspaceId },
        data: { status: "APPROVED", approvedAt: new Date() },
      });
    await tx.auditEvent.create({
      data: {
        workspaceId: link.workspaceId,
        actorId: null,
        action: `review.link.${input.decision}`,
        targetType: "review_task",
        targetId: review.id,
        correlationId: `review-link:${link.id}`,
        metadata: {
          reviewerName: input.reviewerName ?? "External reviewer",
          reason: input.reason ?? null,
        },
      },
    });
    await tx.outboxEvent.create({
      data: {
        workspaceId: link.workspaceId,
        runId: review.runId,
        eventType: "review.decided",
        correlationId: `review-link:${link.id}`,
        idempotencyKey: `${link.id}:${input.decision}:${decision.at}`,
        payload: decision,
      },
    });
    return { review: updatedReview, run: updatedRun, duplicate: false };
  });
  if (!result.duplicate)
    await createNotifications({
      workspaceId: link.workspaceId,
      type: "EXTERNAL_REVIEW_DECIDED",
      title: "Client review decision received",
      body: `An external reviewer chose to ${input.decision} this creative.`,
      payload: {
        reviewTaskId: link.reviewTaskId,
        decision: input.decision,
        reason: input.reason ?? null,
      },
      channels: ["IN_APP", "EMAIL"],
      idempotencyKey: `review-link-notification:${link.id}:${input.decision}:${result.review.updatedAt.toISOString()}`,
    });
  return result;
}

export async function addReviewLinkComment(
  token: string,
  input: {
    text: string;
    region?: string;
    anchor?: ReviewCommentAnchor;
    mentions?: string[];
    parentId?: string;
    reviewerName?: string;
  },
) {
  const text = input.text.trim();
  if (!text || text.length > 4000)
    throw new ApiError(400, "INVALID_COMMENT", "Comment text must contain 1 to 4000 characters.");
  const link = await db.reviewLink.findUnique({
    where: { tokenHash: tokenHash(token) },
    select: {
      id: true,
      workspaceId: true,
      reviewTaskId: true,
      expiresAt: true,
      revokedAt: true,
      views: true,
      maxViews: true,
    },
  });
  if (!link || link.revokedAt || link.expiresAt <= new Date() || link.views >= link.maxViews)
    throw new ApiError(410, "REVIEW_LINK_EXPIRED", "This review link has expired or been revoked.");
  const anchor = normalizeReviewAnchor(input.anchor);
  const mentions = normalizeMentions(input.mentions);
  if (mentions.length) {
    const matchingMembers = await db.membership.count({
      where: { workspaceId: link.workspaceId, userId: { in: mentions }, status: "ACTIVE" },
    });
    if (matchingMembers !== mentions.length)
      throw new ApiError(
        404,
        "COMMENT_MENTION_NOT_FOUND",
        "Every mentioned user must be an active workspace member.",
      );
  }
  if (input.parentId) {
    const parent = await db.comment.findFirst({
      where: { id: input.parentId, reviewTaskId: link.reviewTaskId },
      select: { id: true },
    });
    if (!parent)
      throw new ApiError(
        404,
        "COMMENT_PARENT_NOT_FOUND",
        "The parent comment is not in this review.",
      );
  }
  const comment = await db.comment.create({
    data: {
      reviewTaskId: link.reviewTaskId,
      externalAuthor: input.reviewerName?.trim() || "External reviewer",
      region: input.region?.trim() || undefined,
      anchor: anchor ? reviewCommentJson(anchor) : undefined,
      mentions: mentions.length ? reviewCommentJson(mentions) : undefined,
      parentId: input.parentId,
      text,
    },
  });
  await db.auditEvent.create({
    data: {
      workspaceId: link.workspaceId,
      actorId: null,
      action: "review.link.comment.created",
      targetType: "review_task",
      targetId: link.reviewTaskId,
      correlationId: `review-link:${link.id}`,
      metadata: {
        commentId: comment.id,
        reviewerName: input.reviewerName ?? "External reviewer",
        region: input.region ?? null,
        anchor: anchor ?? null,
        mentions,
      },
    },
  });
  return comment;
}
