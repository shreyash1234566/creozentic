import { z } from "zod";

export const socialPlatform = z.enum(["META", "TIKTOK", "YOUTUBE", "LINKEDIN"]);
export type SocialPlatform = z.infer<typeof socialPlatform>;
export type SocialPublishState =
  | "DRAFT"
  | "UPLOADING"
  | "CONTAINER_READY"
  | "PUBLISHING"
  | "PUBLISHED"
  | "FAILED"
  | "RETRYABLE";
export type SocialPublishInput = {
  platform: SocialPlatform;
  accessToken: string;
  mediaUrl: string;
  caption: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
};
export type SocialPublishResult = {
  platform: SocialPlatform;
  remoteId: string;
  state: SocialPublishState;
  providerPayload: unknown;
};

export interface SocialAdapter {
  readonly platform: SocialPlatform;
  validate(input: SocialPublishInput): Promise<void>;
  createContainer(input: SocialPublishInput): Promise<{ containerId: string }>;
  publish(input: SocialPublishInput & { containerId: string }): Promise<SocialPublishResult>;
  poll(result: SocialPublishResult): Promise<SocialPublishResult>;
}

export function adapterContract(platform: SocialPlatform) {
  return {
    platform,
    requiresOAuth: true,
    requiresIdempotency: true,
    uploadThenPublish: platform !== "LINKEDIN",
    mediaValidation: true,
  };
}

export class HttpSocialAdapter implements SocialAdapter {
  constructor(
    public readonly platform: SocialPlatform,
    private readonly baseUrl: string,
  ) {}
  private async call(
    path: string,
    input: SocialPublishInput | (SocialPublishInput & { containerId: string }),
  ) {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${input.accessToken}` },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(30_000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${this.platform} adapter returned ${response.status}`);
    return payload as Record<string, unknown>;
  }
  async validate(input: SocialPublishInput) {
    if (!input.idempotencyKey || !input.mediaUrl || !input.accessToken)
      throw new Error("Social publish input is incomplete.");
  }
  async createContainer(input: SocialPublishInput) {
    const payload = await this.call("container", input);
    return { containerId: String(payload.containerId ?? payload.id) };
  }
  async publish(input: SocialPublishInput & { containerId: string }) {
    const payload = await this.call("publish", input);
    return {
      platform: this.platform,
      remoteId: String(payload.remoteId ?? payload.id),
      state: "PUBLISHED" as const,
      providerPayload: payload,
    };
  }
  async poll(result: SocialPublishResult) {
    return result;
  }
}
