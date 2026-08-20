export type AiProvider = "gemini" | "openai" | "claude" | "fal";
export type AiRequest = {
  provider: AiProvider;
  model: string;
  workspaceId: string;
  promptVersion: string;
};
export type AiRoute = { provider: AiProvider; model: string; reason: string; external: boolean };
export type AiUsage = {
  workspaceId: string;
  provider: AiProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCredits: number;
};

const defaults: Record<string, AiRoute> = {
  director: {
    provider: "gemini",
    model: "structured-director",
    reason: "structured planning policy",
    external: true,
  },
  caption: {
    provider: "openai",
    model: "caption-normalizer",
    reason: "text normalization policy",
    external: true,
  },
  image: {
    provider: "fal",
    model: "image-generation",
    reason: "visual generation policy",
    external: true,
  },
};

export const aiBoundary = {
  providers: ["gemini", "openai", "claude", "fal"] as const,
  routing: "policy-first",
  usage: "ledger-required",
  structuredOutput: true,
  fallback: true,
} as const;

export function routeAi(
  kind: string,
  enabledProviders: AiProvider[] = [...aiBoundary.providers],
): AiRoute {
  const route = defaults[kind] ?? defaults.director;
  if (!enabledProviders.includes(route.provider))
    return {
      ...route,
      provider: enabledProviders[0] ?? "gemini",
      reason: `${route.reason}; fallback provider`,
      external: true,
    };
  return route;
}

export function estimateAiCredits(inputTokens: number, outputTokens: number, rate = 0.001) {
  return Math.max(1, Math.ceil((inputTokens + outputTokens) * rate));
}
export function recordAiUsage(
  workspaceId: string,
  route: AiRoute,
  inputTokens: number,
  outputTokens: number,
): AiUsage {
  return {
    workspaceId,
    provider: route.provider,
    model: route.model,
    inputTokens,
    outputTokens,
    estimatedCredits: estimateAiCredits(inputTokens, outputTokens),
  };
}
export function parseStructuredOutput<T>(value: unknown, requiredKeys: string[]): T {
  if (!value || typeof value !== "object") throw new Error("AI output must be an object");
  for (const key of requiredKeys) if (!(key in value)) throw new Error(`AI output missing ${key}`);
  return value as T;
}
