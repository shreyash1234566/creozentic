import { z } from "zod";

export const providerConfig = z.object({
  id: z.string(),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  model: z.string().optional(),
  version: z.string().optional(),
});
export type ProviderConfig = z.infer<typeof providerConfig>;

export type AiTask = "classification" | "extraction" | "planning" | "strategy" | "quality";
export type AiGatewayRequest = {
  task: AiTask;
  prompt: string;
  schema: Record<string, unknown>;
  variables?: Record<string, unknown>;
};
export type AiGatewayResponse = {
  providerId: string;
  model: string;
  version: string;
  output: unknown;
  usage?: { inputTokens?: number; outputTokens?: number; costMinor?: number };
};

export interface AiGateway {
  complete(request: AiGatewayRequest): Promise<AiGatewayResponse>;
}

export interface VideoGateway {
  generate(input: {
    prompt: string;
    modelClass: "wan" | "kling" | "premium";
    durationSec: number;
    aspectRatio: string;
  }): Promise<{ providerId: string; jobId: string; status: string }>;
}

export interface SpeechGateway {
  transcribe(input: {
    assetUrl: string;
    language?: string;
    diarize?: boolean;
  }): Promise<{ providerId: string; transcript: unknown; confidence?: number }>;
}

export interface SocialPublisher {
  publish(input: {
    mediaUrl: string;
    caption: string;
    accessToken: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ providerId: string; remoteId: string; status: string }>;
}

export interface BillingGateway {
  createCheckout(input: {
    customerId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ providerId: string; checkoutUrl: string }>;
}

export class HttpJsonGateway
  implements AiGateway, VideoGateway, SpeechGateway, SocialPublisher, BillingGateway
{
  constructor(private readonly config: ProviderConfig) {}
  private async call(path: string, body: unknown) {
    const response = await fetch(
      `${this.config.baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${this.config.id} provider returned ${response.status}`);
    return payload as Record<string, unknown>;
  }
  async complete(request: AiGatewayRequest) {
    const output = await this.call("v1/complete", { ...request, model: this.config.model });
    return {
      providerId: this.config.id,
      model: this.config.model ?? "configured",
      version: this.config.version ?? "unknown",
      output,
      usage: output.usage as AiGatewayResponse["usage"],
    };
  }
  async generate(input: {
    prompt: string;
    modelClass: "wan" | "kling" | "premium";
    durationSec: number;
    aspectRatio: string;
  }) {
    const output = await this.call("v1/video/generate", { ...input, model: this.config.model });
    return {
      providerId: this.config.id,
      jobId: String(output.jobId ?? output.id ?? ""),
      status: String(output.status ?? "QUEUED"),
    };
  }
  async transcribe(input: { assetUrl: string; language?: string; diarize?: boolean }) {
    const output = await this.call("v1/transcribe", input);
    return {
      providerId: this.config.id,
      transcript: output.transcript ?? output,
      confidence: typeof output.confidence === "number" ? output.confidence : undefined,
    };
  }
  async publish(input: {
    mediaUrl: string;
    caption: string;
    accessToken: string;
    metadata?: Record<string, unknown>;
  }) {
    const output = await this.call("v1/publish", input);
    return {
      providerId: this.config.id,
      remoteId: String(output.remoteId ?? output.id ?? ""),
      status: String(output.status ?? "QUEUED"),
    };
  }
  async createCheckout(input: {
    customerId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
  }) {
    const output = await this.call("v1/checkout", input);
    return {
      providerId: this.config.id,
      checkoutUrl: String(output.checkoutUrl ?? output.url ?? ""),
    };
  }
}

export function configuredGateway(id: string, env: NodeJS.ProcessEnv = process.env) {
  const baseUrl = env[`${id.toUpperCase()}_BASE_URL`];
  const apiKey = env[`${id.toUpperCase()}_API_KEY`];
  if (!baseUrl || !apiKey) return null;
  return new HttpJsonGateway(
    providerConfig.parse({ id, baseUrl, apiKey, model: env[`${id.toUpperCase()}_MODEL`] }),
  );
}
