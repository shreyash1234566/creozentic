import { HttpSocialAdapter, type SocialAdapter } from "../index";

/**
 * Adapter registry derived from the cloned Postiz provider surface. The project
 * keeps its own HTTP boundary instead of linking Postiz application code into
 * the proprietary runtime. See docs/cloned-reference-repositories.md.
 */
export function createPostizCompatibleAdapters(
  env: NodeJS.ProcessEnv = process.env,
): Partial<Record<"META" | "TIKTOK" | "YOUTUBE" | "LINKEDIN", SocialAdapter>> {
  return {
    META: env.META_ADAPTER_URL ? new HttpSocialAdapter("META", env.META_ADAPTER_URL) : undefined,
    TIKTOK: env.TIKTOK_ADAPTER_URL
      ? new HttpSocialAdapter("TIKTOK", env.TIKTOK_ADAPTER_URL)
      : undefined,
    YOUTUBE: env.YOUTUBE_ADAPTER_URL
      ? new HttpSocialAdapter("YOUTUBE", env.YOUTUBE_ADAPTER_URL)
      : undefined,
    LINKEDIN: env.LINKEDIN_ADAPTER_URL
      ? new HttpSocialAdapter("LINKEDIN", env.LINKEDIN_ADAPTER_URL)
      : undefined,
  };
}
