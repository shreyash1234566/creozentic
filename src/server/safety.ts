import { ApiError } from "./api";
import { db } from "./db";
import { providerApiError, requestProvider } from "./provider-http";

export async function enforceSafety(input: {
  workspaceId: string;
  text?: string;
  metadata?: Record<string, unknown> | null;
}) {
  const metadata = input.metadata ?? {};
  if (metadata.moderationVerdict === "critical" || metadata.moderationVerdict === "blocked")
    throw new ApiError(409, "MODERATION_BLOCKED", "The content was blocked by the safety gate.");
  if (metadata.rightsChecked === false)
    throw new ApiError(
      409,
      "RIGHTS_CHECK_REQUIRED",
      "Rights and provenance checks must pass before delivery.",
    );
  const consentSubject =
    typeof metadata.consentSubject === "string" ? metadata.consentSubject : undefined;
  if (consentSubject) {
    const consent = await db.consentRecord.findFirst({
      where: {
        workspaceId: input.workspaceId,
        subject: consentSubject,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true },
    });
    if (!consent)
      throw new ApiError(
        409,
        "CONSENT_REQUIRED",
        "No active consent record exists for this likeness or voice.",
      );
  }
  const endpoint = process.env.MODERATION_PROVIDER_URL;
  if (!endpoint && metadata.moderationRequired === true)
    throw new ApiError(
      503,
      "MODERATION_NOT_CONFIGURED",
      "This workflow requires a configured moderation adapter.",
    );
  if (!endpoint) return { verdict: "not_configured", warnings: [] as string[] };
  let body: unknown;
  try {
    body = (
      await requestProvider<unknown>({
        provider: "moderation",
        endpoint,
        headers: process.env.MODERATION_PROVIDER_API_KEY
          ? { authorization: `Bearer ${process.env.MODERATION_PROVIDER_API_KEY}` }
          : undefined,
        idempotencyKey: `moderation:${input.workspaceId}:${JSON.stringify({ text: input.text, metadata })}`,
        body: { workspaceId: input.workspaceId, text: input.text, metadata },
      })
    ).body;
  } catch (error) {
    throw providerApiError(error, "MODERATION_PROVIDER_FAILED", "The moderation adapter failed.");
  }
  const result =
    body && typeof body === "object" && "data" in body ? (body as { data: unknown }).data : body;
  const verdict =
    result &&
    typeof result === "object" &&
    typeof (result as Record<string, unknown>).verdict === "string"
      ? (result as Record<string, unknown>).verdict
      : "unknown";
  if (verdict === "blocked" || verdict === "critical")
    throw new ApiError(409, "MODERATION_BLOCKED", "The content was blocked by the safety gate.");
  if (verdict === "unknown" || verdict === "review")
    return { verdict, warnings: ["Safety classification requires human review."] };
  return { verdict, warnings: [] as string[] };
}
