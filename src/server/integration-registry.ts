import {
  GrowthBookAdapter,
  LagoBillingAdapter,
  NovuNotificationAdapter,
  SvixCompatibleWebhookAdapter,
} from "../../packages/platform/src/index";
import { HttpSocialAdapter } from "../../packages/social/src/index";
import { configuredGateway } from "./provider-adapters";
import { referenceCoverage } from "../../packages/platform/src/reference-integrations";

export function integrationRegistry(env: NodeJS.ProcessEnv = process.env) {
  return {
    references: referenceCoverage(),
    ai: {
      gemini: configuredGateway("gemini", env),
      openai: configuredGateway("openai", env),
      anthropic: configuredGateway("anthropic", env),
      fal: configuredGateway("fal", env),
      deepgram: configuredGateway("deepgram", env),
    },
    social: {
      meta: env.META_ADAPTER_URL ? new HttpSocialAdapter("META", env.META_ADAPTER_URL) : null,
      tiktok: env.TIKTOK_ADAPTER_URL
        ? new HttpSocialAdapter("TIKTOK", env.TIKTOK_ADAPTER_URL)
        : null,
      youtube: env.YOUTUBE_ADAPTER_URL
        ? new HttpSocialAdapter("YOUTUBE", env.YOUTUBE_ADAPTER_URL)
        : null,
      linkedin: env.LINKEDIN_ADAPTER_URL
        ? new HttpSocialAdapter("LINKEDIN", env.LINKEDIN_ADAPTER_URL)
        : null,
    },
    billing:
      env.LAGO_BASE_URL && env.LAGO_API_KEY
        ? new LagoBillingAdapter(env.LAGO_BASE_URL, env.LAGO_API_KEY)
        : null,
    experiments:
      env.GROWTHBOOK_BASE_URL && env.GROWTHBOOK_API_KEY
        ? new GrowthBookAdapter(env.GROWTHBOOK_BASE_URL, env.GROWTHBOOK_API_KEY)
        : null,
    notifications:
      env.NOVU_BASE_URL && env.NOVU_API_KEY
        ? new NovuNotificationAdapter(env.NOVU_BASE_URL, env.NOVU_API_KEY)
        : null,
    webhooks: new SvixCompatibleWebhookAdapter(),
  };
}
