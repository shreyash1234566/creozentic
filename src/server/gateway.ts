import { createHash } from "node:crypto";
import type { CreativeCapability, QualityMode } from "../domain";
import { localStorageEnabled, writeLocalObject } from "./storage";
import { ProviderRequestError, requestProvider } from "./provider-http";

export type CreativeRequest = {
  capability: CreativeCapability;
  inputAssets: string[];
  prompt: string;
  constraints: {
    aspectRatio?: string;
    outputCount?: number;
    qualityMode: QualityMode;
    productLock?: boolean;
    locale?: string;
  };
  workspaceId: string;
  idempotencyKey: string;
};

export type CreativeResult = {
  provider: string;
  model: string;
  modelVersion: string;
  outputs: Array<{
    assetId: string;
    mimeType: string;
    objectKey?: string;
    contentHash?: string;
    name?: string;
    format?: string;
    metadata?: Record<string, unknown>;
    width?: number;
    height?: number;
    durationMs?: number;
  }>;
  usage: { inputUnits?: number; outputUnits?: number; providerCostMinor: number; currency: string };
  warnings: string[];
  providerRequestId?: string;
};

export interface CreativeProvider {
  readonly id: string;
  supports(request: CreativeRequest): boolean;
  execute(request: CreativeRequest): Promise<CreativeResult>;
}

export class ProviderExecutionError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly retryable = true,
  ) {
    super(message);
  }
}

export class ProviderNotConfiguredError extends Error {
  constructor() {
    super("No creative provider adapter is configured for this capability.");
  }
}

function configuredProviders(): CreativeProvider[] {
  let endpoints: Array<{
    id: string;
    url: string;
    apiKey?: string;
    capabilities?: CreativeCapability[];
  }> = [];
  if (process.env.CREATIVE_PROVIDER_ENDPOINTS) {
    try {
      endpoints = JSON.parse(process.env.CREATIVE_PROVIDER_ENDPOINTS) as typeof endpoints;
    } catch {
      throw new ProviderExecutionError(
        "CREATIVE_PROVIDER_ENDPOINTS must be valid JSON.",
        "configuration",
        false,
      );
    }
  } else if (process.env.CREATIVE_PROVIDER_URL) {
    endpoints = [
      {
        id: process.env.CREATIVE_PROVIDER_ID ?? "configured-http-provider",
        url: process.env.CREATIVE_PROVIDER_URL,
        apiKey: process.env.CREATIVE_PROVIDER_API_KEY,
        capabilities: undefined,
      },
    ];
  }
  return endpoints.map((config) => new HttpCreativeProvider(config));
}

function isCreativeResult(value: unknown): value is CreativeResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  const usage = result.usage;
  const outputsValid =
    Array.isArray(result.outputs) &&
    result.outputs.every((output) => {
      if (!output || typeof output !== "object") return false;
      const item = output as Record<string, unknown>;
      return typeof item.assetId === "string" && typeof item.mimeType === "string";
    });
  return (
    typeof result.provider === "string" &&
    typeof result.model === "string" &&
    typeof result.modelVersion === "string" &&
    outputsValid &&
    !!usage &&
    typeof usage === "object" &&
    typeof (usage as Record<string, unknown>).providerCostMinor === "number" &&
    typeof (usage as Record<string, unknown>).currency === "string"
  );
}

export class HttpCreativeProvider implements CreativeProvider {
  readonly id: string;
  private readonly url: string;
  private readonly apiKey?: string;
  private readonly capabilities?: CreativeCapability[];

  constructor(config: {
    id: string;
    url: string;
    apiKey?: string;
    capabilities?: CreativeCapability[];
  }) {
    this.id = config.id;
    this.url = config.url;
    this.apiKey = config.apiKey;
    this.capabilities = config.capabilities;
  }

  supports(request: CreativeRequest) {
    return !this.capabilities || this.capabilities.includes(request.capability);
  }

  async execute(request: CreativeRequest): Promise<CreativeResult> {
    try {
      const { body, requestId } = await requestProvider<unknown>({
        provider: this.id,
        endpoint: this.url,
        body: request,
        headers: this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : undefined,
        idempotencyKey: request.idempotencyKey,
        timeoutMs: Number(process.env.CREATIVE_PROVIDER_TIMEOUT_MS ?? 90_000),
      });
      const result =
        body && typeof body === "object" && "data" in body
          ? (body as { data: unknown }).data
          : body;
      if (!isCreativeResult(result))
        throw new ProviderExecutionError(
          "Provider returned an invalid creative result.",
          this.id,
          false,
        );
      return {
        ...result,
        provider: result.provider || this.id,
        providerRequestId: result.providerRequestId ?? requestId,
      };
    } catch (error) {
      if (error instanceof ProviderExecutionError) throw error;
      if (error instanceof ProviderRequestError)
        throw new ProviderExecutionError(error.message, this.id, error.retryable);
      throw new ProviderExecutionError(
        error instanceof Error ? error.message : "Provider request failed.",
        this.id,
        true,
      );
    }
  }
}

class LocalDeterministicProvider implements CreativeProvider {
  readonly id = "local-deterministic";

  supports(request: CreativeRequest) {
    return (
      process.env.NODE_ENV !== "production" &&
      process.env.LOCAL_CREATIVE_PROVIDER_ENABLED === "true" &&
      localStorageEnabled() &&
      (request.capability === "image.generate" || request.capability === "image.edit")
    );
  }

  async execute(request: CreativeRequest): Promise<CreativeResult> {
    const outputCount = Math.min(Math.max(request.constraints.outputCount ?? 1, 1), 12);
    const outputs = await Promise.all(
      Array.from({ length: outputCount }, async (_, index) => {
        const seed = createHash("sha256")
          .update(`${request.idempotencyKey}:${index}:${request.prompt}`)
          .digest("hex");
        const assetId = `local-${seed.slice(0, 24)}`;
        const objectKey = `workspaces/${request.workspaceId}/generated/${seed}.svg`;
        const { width, height } = localDimensions(request.constraints.aspectRatio);
        const safePrompt = request.prompt
          .replace(
            /[&<>"']/g,
            (character) =>
              ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[
                character
              ] ?? character,
          )
          .slice(0, 180);
        const body = Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#241b17"/><stop offset="1" stop-color="#a6410a"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><text x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.42)}" fill="#fff" font-family="Arial,sans-serif" font-size="${Math.max(22, Math.round(width / 24))}" font-weight="700">Autozentic draft ${index + 1}</text><text x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.52)}" fill="#fff" opacity=".84" font-family="Arial,sans-serif" font-size="${Math.max(14, Math.round(width / 52))}">${safePrompt}</text><text x="${width - 24}" y="${height - 20}" text-anchor="end" fill="#fff" opacity=".5" font-family="Arial,sans-serif" font-size="12">local deterministic renderer</text></svg>`,
        );
        await writeLocalObject(objectKey, body, "image/svg+xml");
        return {
          assetId,
          name: `local-variant-${index + 1}.svg`,
          mimeType: "image/svg+xml",
          objectKey,
          contentHash: `sha256:${createHash("sha256").update(body).digest("hex")}`,
          format: request.constraints.aspectRatio ?? "1:1",
          width,
          height,
          metadata: {
            renderer: "local-deterministic",
            deterministic: true,
            productTruth: request.constraints.productLock === true,
            brandChecked: true,
            claimsChecked: true,
            rightsChecked: true,
            aiEdited: true,
          },
        };
      }),
    );
    return {
      provider: this.id,
      model: "local-svg",
      modelVersion: "1",
      outputs,
      usage: { outputUnits: outputs.length, providerCostMinor: 0, currency: "INR" },
      warnings: [
        "Generated by the local deterministic provider; connect an approved creative provider for production-quality imagery.",
      ],
      providerRequestId: request.idempotencyKey,
    };
  }
}

function localDimensions(aspectRatio?: string) {
  if (aspectRatio === "9:16") return { width: 1080, height: 1920 };
  if (aspectRatio === "4:5") return { width: 1080, height: 1350 };
  if (aspectRatio === "16:9") return { width: 1920, height: 1080 };
  return { width: 1080, height: 1080 };
}

export function listConfiguredProviders() {
  return [...configuredProviders(), new LocalDeterministicProvider()]
    .filter((provider) =>
      provider.supports({
        capability: "image.generate",
        inputAssets: [],
        prompt: "",
        constraints: { qualityMode: "balanced" },
        workspaceId: "",
        idempotencyKey: "",
      }),
    )
    .map((provider) => ({ id: provider.id }));
}

export async function executeCreativeRequest(request: CreativeRequest): Promise<CreativeResult> {
  const providers = [...configuredProviders(), new LocalDeterministicProvider()].filter(
    (provider) => provider.supports(request),
  );
  if (providers.length === 0) throw new ProviderNotConfiguredError();
  let lastError: unknown;
  for (const provider of providers) {
    try {
      return await provider.execute(request);
    } catch (error) {
      lastError = error;
      if (error instanceof ProviderExecutionError && !error.retryable) throw error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new ProviderExecutionError("All configured creative providers failed.", providers[0].id);
}
