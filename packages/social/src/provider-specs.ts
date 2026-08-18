import type { SocialPlatform, SocialPublishInput } from "./index";

export type ProviderSpec = {
  platform: SocialPlatform;
  maxCaptionChars: number;
  allowedMime: string[];
  requiresContainer: boolean;
  pollable: boolean;
};
export const providerSpecs: Record<SocialPlatform, ProviderSpec> = {
  META: {
    platform: "META",
    maxCaptionChars: 2200,
    allowedMime: ["video/mp4", "image/jpeg", "image/png"],
    requiresContainer: true,
    pollable: true,
  },
  TIKTOK: {
    platform: "TIKTOK",
    maxCaptionChars: 2200,
    allowedMime: ["video/mp4"],
    requiresContainer: true,
    pollable: true,
  },
  YOUTUBE: {
    platform: "YOUTUBE",
    maxCaptionChars: 5000,
    allowedMime: ["video/mp4", "video/quicktime"],
    requiresContainer: true,
    pollable: true,
  },
  LINKEDIN: {
    platform: "LINKEDIN",
    maxCaptionChars: 3000,
    allowedMime: ["video/mp4", "image/jpeg", "image/png"],
    requiresContainer: false,
    pollable: false,
  },
};

export function validateProviderInput(input: SocialPublishInput & { mimeType?: string }) {
  const spec = providerSpecs[input.platform];
  if (input.caption.length > spec.maxCaptionChars)
    throw new Error(`${input.platform} caption exceeds ${spec.maxCaptionChars} characters`);
  if (input.mimeType && !spec.allowedMime.includes(input.mimeType))
    throw new Error(`${input.platform} does not accept ${input.mimeType}`);
  return spec;
}
