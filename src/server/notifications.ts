import { Prisma } from "@prisma/client";
import { ApiError } from "./api";
import { requireRole, type RequestContext } from "./auth";
import { db } from "./db";
import { providerApiError, requestProvider } from "./provider-http";

function json(value: unknown) {
  return value as Prisma.InputJsonValue;
}

export type NotificationInput = {
  workspaceId: string;
  recipientId?: string;
  type: string;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
  channels?: Array<"IN_APP" | "EMAIL" | "WHATSAPP">;
  idempotencyKey: string;
};

export async function createNotifications(input: NotificationInput) {
  const channels = [...new Set(input.channels?.length ? input.channels : ["IN_APP"])];
  const created = [];
  for (const channel of channels) {
    const key = `${input.idempotencyKey}:${channel}`;
    const notification = await db.notification.upsert({
      where: {
        workspaceId_idempotencyKey: { workspaceId: input.workspaceId, idempotencyKey: key },
      },
      update: {},
      create: {
        workspaceId: input.workspaceId,
        recipientId: input.recipientId,
        type: input.type.trim(),
        channel,
        status: channel === "IN_APP" ? "DELIVERED" : "PENDING",
        title: input.title.trim(),
        body: input.body.trim(),
        payload: input.payload ? json(input.payload) : undefined,
        idempotencyKey: key,
        sentAt: channel === "IN_APP" ? new Date() : undefined,
      },
    });
    created.push(notification);
  }
  return created;
}

export async function listNotifications(context: RequestContext, unreadOnly = false) {
  requireRole(context, "VIEWER");
  return db.notification.findMany({
    where: {
      workspaceId: context.workspaceId,
      ...(context.role === "CLIENT" ? { recipientId: context.userId } : {}),
      ...(unreadOnly ? { readAt: null } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export async function markNotificationRead(context: RequestContext, notificationId: string) {
  requireRole(context, "VIEWER");
  const notification = await db.notification.findFirst({
    where: {
      id: notificationId,
      workspaceId: context.workspaceId,
      ...(context.role === "CLIENT" ? { recipientId: context.userId } : {}),
    },
  });
  if (!notification)
    throw new ApiError(404, "NOTIFICATION_NOT_FOUND", "The notification was not found.");
  return db.notification.update({ where: { id: notification.id }, data: { readAt: new Date() } });
}

function endpointFor(channel: string) {
  return process.env[`NOTIFICATION_${channel}_URL`];
}

export async function dispatchPendingNotifications(limit = 100) {
  const pending = await db.notification.findMany({
    where: { status: "PENDING", channel: { in: ["EMAIL", "WHATSAPP"] } },
    orderBy: { createdAt: "asc" },
    take: Math.min(Math.max(limit, 1), 500),
  });
  const results = [];
  for (const notification of pending) {
    const endpoint = endpointFor(notification.channel);
    if (!endpoint) {
      results.push({ id: notification.id, status: "AWAITING_PROVIDER" });
      continue;
    }
    try {
      const response = await requestProvider({
        provider: `notification:${notification.channel.toLowerCase()}`,
        endpoint,
        idempotencyKey: notification.idempotencyKey,
        body: {
          workspaceId: notification.workspaceId,
          recipientId: notification.recipientId,
          type: notification.type,
          title: notification.title,
          body: notification.body,
          payload: notification.payload,
        },
      });
      await db.notification.update({
        where: { id: notification.id },
        data: {
          status: "DELIVERED",
          sentAt: new Date(),
          error: undefined,
          payload: json({
            ...(notification.payload && typeof notification.payload === "object"
              ? notification.payload
              : {}),
            providerRequestId: response.requestId ?? null,
          }),
        },
      });
      results.push({ id: notification.id, status: "DELIVERED" });
    } catch (error) {
      const providerError = providerApiError(
        error,
        "NOTIFICATION_DELIVERY_FAILED",
        "The notification delivery adapter failed.",
      );
      await db.notification.update({
        where: { id: notification.id },
        data: {
          status: "FAILED",
          error: json({ code: providerError.code, message: providerError.message }),
        },
      });
      results.push({ id: notification.id, status: "FAILED" });
    }
  }
  return results;
}
