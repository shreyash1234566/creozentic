import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { Prisma, type MembershipRole } from "@prisma/client";
import { ApiError } from "./api";
import { db } from "./db";
import { usableConnectionAccessToken } from "./connector-oauth";
import { requireRole, type RequestContext } from "./auth";
import { createRun, failRunInternal } from "./workflow-service";
import { enqueueWorkflowRun } from "./queue";
import { decideReviewLink } from "./review-links";
import { createCreativeRequest, materializeCreativeRequest } from "./daily-autopilot";
import { providerApiError, requestProvider } from "./provider-http";

type ChannelPayload = {
  eventId?: string;
  eventType?: string;
  workspaceId?: string;
  accountId?: string;
  externalSubject?: string;
  messageId?: string;
  text?: string;
  action?: "request" | "approve" | "reject" | "refine" | "status";
  reviewToken?: string;
  reviewerName?: string;
  title?: string;
  brief?: unknown;
  [key: string]: unknown;
};

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function envKey(provider: string, suffix: string) {
  return `CONNECTOR_${provider.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_${suffix}`;
}

function signatureMatches(rawBody: string, supplied: string, secret: string) {
  const normalized = supplied.replace(/^sha256=/i, "");
  const expectedHex = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBase64Url = createHmac("sha256", secret).update(rawBody).digest("base64url");
  return [expectedHex, expectedBase64Url].some((expected) => {
    const left = Buffer.from(expected);
    const right = Buffer.from(normalized);
    return left.length === right.length && timingSafeEqual(left, right);
  });
}

function payloadJson(payload: ChannelPayload) {
  return payload as Prisma.InputJsonValue;
}

function channelEventId(payload: ChannelPayload, headerEventId?: string | null) {
  const value = payload.eventId ?? headerEventId ?? payload.messageId;
  if (typeof value !== "string" || !value.trim())
    throw new ApiError(
      400,
      "CONNECTOR_EVENT_ID_REQUIRED",
      "A stable connector event ID is required.",
    );
  return value.trim();
}

async function sendNativeWhatsApp(input: {
  accessToken: string;
  connectionMetadata: Record<string, unknown>;
  to: string;
  text: string;
  templateName?: string;
  idempotencyKey: string;
}) {
  const phoneNumberId =
    typeof input.connectionMetadata.phoneNumberId === "string"
      ? input.connectionMetadata.phoneNumberId.trim()
      : "";
  if (!phoneNumberId)
    throw new ApiError(
      503,
      "WHATSAPP_PHONE_NUMBER_NOT_CONFIGURED",
      "Set the WhatsApp Business phoneNumberId on this connection before sending messages.",
    );
  const version = process.env.META_GRAPH_API_VERSION ?? "v22.0";
  const templateLanguage =
    typeof input.connectionMetadata.templateLanguage === "string"
      ? input.connectionMetadata.templateLanguage
      : "en_US";
  const body = input.templateName
    ? {
        messaging_product: "whatsapp",
        to: input.to,
        type: "template",
        template: { name: input.templateName, language: { code: templateLanguage } },
      }
    : {
        messaging_product: "whatsapp",
        to: input.to,
        type: "text",
        text: { preview_url: false, body: input.text },
      };
  const response = await requestProvider<unknown>({
    provider: "whatsapp",
    endpoint: `https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}/messages`,
    headers: { authorization: `Bearer ${input.accessToken}` },
    idempotencyKey: input.idempotencyKey,
    body,
  });
  const payload = record(response.body);
  const firstMessage = Array.isArray(payload.messages) ? record(payload.messages[0]) : {};
  const messageId = typeof firstMessage.id === "string" ? firstMessage.id : "";
  if (!messageId) throw new Error("WhatsApp accepted the request without returning a message ID.");
  return { ...payload, messageId, provider: "whatsapp", requestId: response.requestId ?? null };
}

async function resolveConnection(provider: string, payload: ChannelPayload) {
  const workspaceId = typeof payload.workspaceId === "string" ? payload.workspaceId : undefined;
  const accountId = typeof payload.accountId === "string" ? payload.accountId : undefined;
  const externalSubject =
    typeof payload.externalSubject === "string" ? payload.externalSubject : undefined;
  let connection = workspaceId
    ? await db.connection.findFirst({
        where: { provider, workspaceId, health: { in: ["HEALTHY", "EXPIRING"] } },
      })
    : null;
  if (!connection && !workspaceId && externalSubject) {
    const identity = await db.channelIdentity.findFirst({
      where: { provider, externalSubject },
      select: { workspaceId: true },
    });
    if (identity)
      connection = await db.connection.findFirst({
        where: {
          provider,
          workspaceId: identity.workspaceId,
          health: { in: ["HEALTHY", "EXPIRING"] },
        },
      });
  }
  if (!connection && !workspaceId && accountId) {
    const candidates = await db.connection.findMany({
      where: { provider, health: { in: ["HEALTHY", "EXPIRING"] } },
    });
    connection =
      candidates.find((candidate) => record(candidate.metadata).accountId === accountId) ?? null;
  }
  if (!connection) return null;
  const metadata = record(connection.metadata);
  if (typeof metadata.accountId === "string" && metadata.accountId !== accountId) return null;
  if (!metadata.accountId && !accountId && externalSubject) {
    const mappedIdentity = await db.channelIdentity.findFirst({
      where: { workspaceId: connection.workspaceId, provider, externalSubject },
      select: { id: true },
    });
    if (!mappedIdentity) return null;
  }
  if (!metadata.accountId && !accountId && !payload.externalSubject) return null;
  if (accountId && typeof metadata.accountId !== "string") return null;
  if (accountId && typeof metadata.accountId === "string" && metadata.accountId !== accountId)
    return null;
  return connection;
}

async function membershipForIdentity(identity: { workspaceId: string; userId: string | null }) {
  if (!identity.userId) return null;
  return db.membership.findUnique({
    where: { workspaceId_userId: { workspaceId: identity.workspaceId, userId: identity.userId } },
    select: { userId: true, role: true, status: true },
  });
}

function contextForIdentity(
  identity: { workspaceId: string; userId: string | null },
  membership: { userId: string; role: MembershipRole },
  correlationId: string,
): RequestContext {
  return {
    workspaceId: identity.workspaceId,
    userId: membership.userId,
    role: membership.role,
    correlationId,
  };
}

async function processVerifiedAction(
  provider: string,
  identity: { id: string; workspaceId: string; userId: string | null; externalSubject: string },
  payload: ChannelPayload,
  correlationId: string,
) {
  const membership = await membershipForIdentity(identity);
  if (!membership || membership.status !== "ACTIVE")
    return { status: "UNAUTHORIZED", result: undefined };
  if (!payload.action) return { status: "RECEIVED", result: undefined };

  if (payload.action === "approve" || payload.action === "reject" || payload.action === "refine") {
    if (!payload.reviewToken)
      throw new ApiError(
        400,
        "REVIEW_TOKEN_REQUIRED",
        "A review token is required for this action.",
      );
    const result = await decideReviewLink(payload.reviewToken, {
      decision: payload.action,
      reviewerName: payload.reviewerName ?? identity.externalSubject,
      reason: typeof payload.text === "string" ? payload.text : undefined,
    });
    return { status: "PROCESSED", result: { review: result.review, run: result.run } };
  }

  if (payload.action === "status") return { status: "PROCESSED", result: { status: "accepted" } };
  if (payload.action !== "request") return { status: "RECEIVED", result: undefined };
  requireRole(contextForIdentity(identity, membership, correlationId), "EDITOR");
  const context = contextForIdentity(identity, membership, correlationId);
  if (provider.includes("whatsapp") || payload.autopilot === true) {
    const rawMessage =
      typeof payload.text === "string" && payload.text.trim()
        ? payload.text
        : JSON.stringify(payload.brief ?? payload);
    const request = await createCreativeRequest(context, {
      rawMessage,
      source: "WHATSAPP",
      channel: "whatsapp",
      requestedDate: typeof payload.requestedDate === "string" ? payload.requestedDate : undefined,
      consent: record(payload.consent),
      idempotencyKey: `channel:${provider}:${payload.messageId ?? payload.eventId}`,
    });
    const materialized = request.request.id
      ? await materializeCreativeRequest(context, request.request.id)
      : null;
    return {
      status: "PROCESSED",
      result: {
        creativeRequest: materialized?.request ?? request.request,
        dailyPlan: materialized?.plan ?? null,
        blocked: materialized?.blocked ?? false,
        deduplicated: request.deduplicated || materialized?.deduplicated,
      },
    };
  }
  const result = await createRun(context, {
    title:
      typeof payload.title === "string" && payload.title.trim()
        ? payload.title
        : `${provider} creative request`,
    brief: payload.brief,
    idempotencyKey: `channel:${provider}:${payload.messageId ?? payload.eventId}`,
  });
  const queue = await enqueueWorkflowRun({
    runId: result.run.id,
    workspaceId: context.workspaceId,
    correlationId,
  });
  if (!queue.accepted) {
    await failRunInternal({
      workspaceId: context.workspaceId,
      runId: result.run.id,
      correlationId,
      error: { code: "QUEUE_NOT_CONFIGURED", message: queue.reason ?? "The queue is unavailable." },
    });
    throw new ApiError(503, "QUEUE_NOT_CONFIGURED", queue.reason ?? "The queue is unavailable.");
  }
  return { status: "PROCESSED", result: { runId: result.run.id, quote: result.quote, queue } };
}

export async function ingestConnectorWebhook(
  provider: string,
  rawBody: string,
  suppliedSignature: string | null,
  headerEventId?: string | null,
) {
  const normalizedProvider = provider.trim().toLowerCase();
  const secret = process.env[envKey(normalizedProvider, "WEBHOOK_SECRET")];
  if (!secret)
    throw new ApiError(
      503,
      "CONNECTOR_WEBHOOK_NOT_CONFIGURED",
      `Webhook verification is not configured for ${normalizedProvider}.`,
    );
  if (!suppliedSignature || !signatureMatches(rawBody, suppliedSignature, secret))
    throw new ApiError(
      401,
      "INVALID_CONNECTOR_SIGNATURE",
      "The connector webhook signature is invalid.",
    );
  let payload: ChannelPayload;
  try {
    payload = record(JSON.parse(rawBody)) as ChannelPayload;
  } catch {
    throw new ApiError(
      400,
      "INVALID_CONNECTOR_PAYLOAD",
      "The connector payload must be valid JSON.",
    );
  }
  const externalEventId = channelEventId(payload, headerEventId);
  const existing = await db.connectorEvent.findUnique({
    where: { provider_externalEventId: { provider: normalizedProvider, externalEventId } },
  });
  if (existing) return { duplicate: true, event: existing };

  const connection = await resolveConnection(normalizedProvider, payload);
  const correlationId = `connector:${normalizedProvider}:${externalEventId}`;
  const event = await db.connectorEvent
    .create({
      data: {
        provider: normalizedProvider,
        externalEventId,
        eventType: typeof payload.eventType === "string" ? payload.eventType : "message",
        workspaceId: connection?.workspaceId,
        status: connection ? "RECEIVED" : "UNMAPPED",
        payload: payloadJson(payload),
      },
    })
    .catch(async (error) => {
      if ((error as { code?: string }).code === "P2002") {
        const concurrent = await db.connectorEvent.findUnique({
          where: { provider_externalEventId: { provider: normalizedProvider, externalEventId } },
        });
        if (concurrent) return concurrent;
      }
      throw error;
    });
  if (event.status === "UNMAPPED") return { duplicate: false, event, status: "UNMAPPED" };

  const externalSubject =
    typeof payload.externalSubject === "string" ? payload.externalSubject.trim() : "";
  const messageId =
    typeof payload.messageId === "string" ? payload.messageId.trim() : externalEventId;
  if (!externalSubject) {
    await db.connectorEvent.update({
      where: { id: event.id },
      data: {
        status: "FAILED",
        error: "The normalized connector event needs an externalSubject.",
      },
    });
    throw new ApiError(
      400,
      "CONNECTOR_SUBJECT_REQUIRED",
      "The normalized connector event needs an externalSubject.",
    );
  }
  const identity = await db.channelIdentity.upsert({
    where: {
      workspaceId_provider_externalSubject: {
        workspaceId: connection!.workspaceId,
        provider: normalizedProvider,
        externalSubject,
      },
    },
    update: {
      displayName: typeof payload.reviewerName === "string" ? payload.reviewerName : undefined,
    },
    create: {
      workspaceId: connection!.workspaceId,
      provider: normalizedProvider,
      externalSubject,
      displayName: typeof payload.reviewerName === "string" ? payload.reviewerName : undefined,
      status: "PENDING",
    },
  });
  const message = await db.channelMessage
    .create({
      data: {
        workspaceId: connection!.workspaceId,
        identityId: identity.id,
        provider: normalizedProvider,
        externalMessageId: messageId,
        direction: "INBOUND",
        messageType: typeof payload.eventType === "string" ? payload.eventType : "text",
        text: typeof payload.text === "string" ? payload.text : undefined,
        status: identity.status === "VERIFIED" ? "PROCESSING" : "UNAUTHORIZED",
        payload: payloadJson(payload),
        idempotencyKey: `${normalizedProvider}:${messageId}`,
      },
    })
    .catch(async (error) => {
      if ((error as { code?: string }).code === "P2002")
        return db.channelMessage.findUnique({
          where: {
            provider_externalMessageId: {
              provider: normalizedProvider,
              externalMessageId: messageId,
            },
          },
        });
      throw error;
    });
  if (!message)
    throw new ApiError(
      500,
      "CONNECTOR_MESSAGE_NOT_STORED",
      "The connector message could not be stored.",
    );
  let result: unknown;
  let status = message.status;
  try {
    if (identity.status === "VERIFIED") {
      const action = await processVerifiedAction(
        normalizedProvider,
        identity,
        payload,
        correlationId,
      );
      status = action.status;
      result = action.result;
    }
    await db.channelMessage.update({ where: { id: message.id }, data: { status } });
    await db.connectorEvent.update({
      where: { id: event.id },
      data: { status: "PROCESSED", processedAt: new Date() },
    });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "The connector event failed.";
    await db.channelMessage.update({ where: { id: message.id }, data: { status: "FAILED" } });
    await db.connectorEvent.update({
      where: { id: event.id },
      data: { status: "FAILED", error: messageText },
    });
    throw error;
  }
  return { duplicate: false, event, message, status, result };
}

export async function listChannelIdentities(context: RequestContext) {
  requireRole(context, "ADMIN");
  return db.channelIdentity.findMany({
    where: { workspaceId: context.workspaceId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      provider: true,
      externalSubject: true,
      userId: true,
      displayName: true,
      status: true,
      verifiedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function verifyChannelIdentity(
  context: RequestContext,
  identityId: string,
  input: { userId?: string; status: "VERIFIED" | "REVOKED" },
) {
  requireRole(context, "ADMIN");
  const identity = await db.channelIdentity.findFirst({
    where: { id: identityId, workspaceId: context.workspaceId },
  });
  if (!identity)
    throw new ApiError(404, "CHANNEL_IDENTITY_NOT_FOUND", "The channel identity was not found.");
  if (input.status === "VERIFIED") {
    const userId = input.userId ?? identity.userId;
    if (!userId)
      throw new ApiError(
        400,
        "CHANNEL_USER_REQUIRED",
        "A workspace user must be linked before verification.",
      );
    const membership = await db.membership.findUnique({
      where: { workspaceId_userId: { workspaceId: context.workspaceId, userId } },
    });
    if (!membership || membership.status !== "ACTIVE")
      throw new ApiError(
        403,
        "WORKSPACE_ACCESS_DENIED",
        "The linked user is not an active workspace member.",
      );
    return db.channelIdentity.update({
      where: { id: identity.id },
      data: { userId, status: "VERIFIED", verifiedAt: new Date() },
      select: {
        id: true,
        provider: true,
        externalSubject: true,
        userId: true,
        status: true,
        verifiedAt: true,
      },
    });
  }
  return db.channelIdentity.update({
    where: { id: identity.id },
    data: { status: "REVOKED", verifiedAt: null },
    select: {
      id: true,
      provider: true,
      externalSubject: true,
      userId: true,
      status: true,
      verifiedAt: true,
    },
  });
}

export async function sendConnectorMessage(
  context: RequestContext,
  input: {
    provider: string;
    externalSubject: string;
    text: string;
    idempotencyKey: string;
    templateName?: string;
    templateApproved?: boolean;
    customerServiceWindowOpen?: boolean;
  },
) {
  requireRole(context, "EDITOR");
  const identity = await db.channelIdentity.findFirst({
    where: {
      workspaceId: context.workspaceId,
      provider: input.provider,
      externalSubject: input.externalSubject,
      status: "VERIFIED",
    },
  });
  if (!identity)
    throw new ApiError(
      403,
      "CHANNEL_IDENTITY_NOT_VERIFIED",
      "The destination identity is not verified.",
    );
  const connection = await db.connection.findFirst({
    where: {
      workspaceId: context.workspaceId,
      provider: input.provider,
      health: { in: ["HEALTHY", "EXPIRING"] },
    },
  });
  if (!connection)
    throw new ApiError(409, "CONNECTION_NOT_HEALTHY", "The connector connection is not healthy.");
  const connectionMetadata = record(connection.metadata);
  const isWhatsApp = input.provider.includes("whatsapp");
  // The window is provider-derived state, never a caller assertion. A caller may only
  // choose the stricter false value while a webhook/CRM integration refreshes it.
  const serviceWindowOpen =
    Boolean(connectionMetadata.customerServiceWindowOpen) &&
    input.customerServiceWindowOpen !== false;
  if (isWhatsApp && !serviceWindowOpen && (!input.templateName || input.templateApproved !== true))
    throw new ApiError(
      409,
      "WHATSAPP_TEMPLATE_REQUIRED",
      "WhatsApp messages outside the customer-service window require an approved template name.",
    );
  const endpoint = process.env[envKey(input.provider, "SEND_URL")];
  const usesNativeWhatsApp = input.provider === "whatsapp" && !endpoint;
  if (!endpoint && !usesNativeWhatsApp)
    throw new ApiError(
      503,
      "CONNECTOR_SEND_NOT_CONFIGURED",
      `The ${input.provider} send adapter is not configured.`,
    );
  const existing = await db.channelMessage.findUnique({
    where: {
      workspaceId_idempotencyKey: {
        workspaceId: context.workspaceId,
        idempotencyKey: input.idempotencyKey,
      },
    },
  });
  if (existing) return { message: existing, deduplicated: true };
  const created = await db.channelMessage.create({
    data: {
      workspaceId: context.workspaceId,
      identityId: identity.id,
      provider: input.provider,
      externalMessageId: `pending:${input.idempotencyKey}`,
      direction: "OUTBOUND",
      text: input.text,
      status: "QUEUED",
      payload: { text: input.text, templateName: input.templateName ?? null, serviceWindowOpen },
      idempotencyKey: input.idempotencyKey,
    },
  });
  try {
    const accessToken = await usableConnectionAccessToken(connection.id, context.workspaceId);
    const body = endpoint
      ? record(
          (
            await requestProvider<unknown>({
              provider: `connector:${input.provider}`,
              endpoint,
              headers: { authorization: `Bearer ${accessToken}` },
              idempotencyKey: input.idempotencyKey,
              body: {
                to: input.externalSubject,
                text: input.text,
                templateName: input.templateName,
                serviceWindowOpen,
              },
            })
          ).body,
        )
      : await sendNativeWhatsApp({
          accessToken,
          connectionMetadata,
          to: input.externalSubject,
          text: input.text,
          templateName: input.templateName,
          idempotencyKey: input.idempotencyKey,
        });
    const externalMessageId =
      typeof body.messageId === "string" ? body.messageId : created.externalMessageId;
    const message = await db.channelMessage.update({
      where: { id: created.id },
      data: { externalMessageId, status: "SENT", payload: body as Prisma.InputJsonValue },
    });
    return { message, deduplicated: false };
  } catch (error) {
    const message = await db.channelMessage.update({
      where: { id: created.id },
      data: { status: "FAILED", payload: { text: input.text } },
    });
    const providerError = providerApiError(
      error,
      "CONNECTOR_SEND_FAILED",
      "The connector message could not be sent.",
    );
    throw new ApiError(providerError.status, providerError.code, providerError.message, {
      messageId: message.id,
      ...(providerError.details &&
      typeof providerError.details === "object" &&
      !Array.isArray(providerError.details)
        ? providerError.details
        : {}),
    });
  }
}
