import { createHash } from "node:crypto";
import { z } from "zod";

export const verticalPackSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  name: z.string(),
  audience: z.string(),
  forbiddenClaims: z.array(z.string()),
  requiredEvidence: z.array(z.string()),
  platformRules: z.record(z.string(), z.unknown()),
});
export type VerticalPack = z.infer<typeof verticalPackSchema>;
export function validateVerticalPack(pack: unknown) {
  return verticalPackSchema.parse(pack);
}

export type RetrievalChunk = {
  id: string;
  text: string;
  embedding?: number[];
  sourceId: string;
  version: string;
  rightsStatus: "APPROVED" | "PENDING" | "REJECTED";
};
export function rankRetrieval(chunks: RetrievalChunk[], queryEmbedding: number[], limit = 8) {
  const score = (chunk: RetrievalChunk) =>
    chunk.embedding?.length === queryEmbedding.length
      ? chunk.embedding.reduce((sum, value, index) => sum + value * queryEmbedding[index], 0)
      : 0;
  return chunks
    .filter((chunk) => chunk.rightsStatus === "APPROVED")
    .sort((a, b) => score(b) - score(a))
    .slice(0, limit);
}

export const analyticsEventSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  platform: z.string(),
  event: z.string(),
  occurredAt: z.coerce.date(),
  contentId: z.string().optional(),
  impressions: z.number().nonnegative().default(0),
  views: z.number().nonnegative().default(0),
  clicks: z.number().nonnegative().default(0),
  conversions: z.number().nonnegative().default(0),
  spendMinor: z.number().nonnegative().default(0),
  payload: z.record(z.string(), z.unknown()),
});
export type AnalyticsEvent = z.infer<typeof analyticsEventSchema>;
export function normalizeAnalyticsEvent(input: unknown) {
  return analyticsEventSchema.parse(input);
}
export function performanceScore(event: AnalyticsEvent) {
  const denominator = Math.max(1, event.impressions);
  return Math.min(
    100,
    (event.views / denominator) * 40 +
      (event.clicks / denominator) * 30 +
      (event.conversions / denominator) * 30,
  );
}

export type SafetyDecision = { allowed: boolean; reason: string; requiredApprovals: string[] };
export function evaluateSafety(input: {
  rightsApproved: boolean;
  factualEvidence: boolean;
  moderationPassed: boolean;
  autonomous: boolean;
}): SafetyDecision {
  const requiredApprovals: string[] = [];
  if (!input.rightsApproved) requiredApprovals.push("RIGHTS");
  if (!input.factualEvidence) requiredApprovals.push("FACTUAL_EVIDENCE");
  if (!input.moderationPassed) requiredApprovals.push("MODERATION");
  if (input.autonomous && requiredApprovals.length)
    return { allowed: false, reason: "Autonomy prerequisites are incomplete.", requiredApprovals };
  return {
    allowed: requiredApprovals.length === 0,
    reason: requiredApprovals.length ? "Human approval required." : "Policy checks passed.",
    requiredApprovals,
  };
}

export type RetryPolicy = {
  maxAttempts: number;
  backoffMs: number[];
  retryableCodes: string[];
  deadLetterAfter: number;
};
export const defaultRetryPolicy: RetryPolicy = {
  maxAttempts: 3,
  backoffMs: [1000, 5000, 30000],
  retryableCodes: ["TIMEOUT", "RATE_LIMITED", "PROVIDER_UNAVAILABLE", "NETWORK_ERROR"],
  deadLetterAfter: 3,
};
export function shouldRetry(policy: RetryPolicy, attempt: number, code: string) {
  return attempt < policy.maxAttempts && policy.retryableCodes.includes(code);
}

export type QuotaPolicy = {
  requestsPerMinute: number;
  concurrentJobs: number;
  monthlyCredits: number;
  maxUploadBytes: number;
};
export const defaultQuotaPolicy: QuotaPolicy = {
  requestsPerMinute: 120,
  concurrentJobs: 4,
  monthlyCredits: 10000,
  maxUploadBytes: 5_000_000_000,
};
export function quotaRemaining(
  policy: QuotaPolicy,
  usage: { requests: number; concurrent: number; credits: number; uploadBytes: number },
) {
  return {
    requests: Math.max(0, policy.requestsPerMinute - usage.requests),
    concurrent: Math.max(0, policy.concurrentJobs - usage.concurrent),
    credits: Math.max(0, policy.monthlyCredits - usage.credits),
    uploadBytes: Math.max(0, policy.maxUploadBytes - usage.uploadBytes),
  };
}

export function reproducibilityHash(input: {
  plan: unknown;
  sourceChecksums: string[];
  promptVersions: Record<string, string>;
  modelVersions: Record<string, string>;
  rendererVersion: string;
  fontVersions: Record<string, string>;
}) {
  return createHash("sha256")
    .update(JSON.stringify(input, Object.keys(input).sort()))
    .digest("hex");
}
export type AcceptanceResult = { passed: boolean; failures: string[] };
export function evaluateAcceptance(input: {
  identity: boolean;
  media: boolean;
  ai: boolean;
  social: boolean;
  analytics: boolean;
  billing: boolean;
  operations: boolean;
}): AcceptanceResult {
  const failures = Object.entries(input)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  return { passed: failures.length === 0, failures };
}
