export type ReferenceIntegration = {
  id: "better-auth" | "postiz" | "lago" | "growthbook" | "novu" | "svix";
  repository: string;
  revision: string;
  sourcePaths: string[];
  applicationBoundary: string;
  activation: "local-boundary" | "external-service";
};

export const referenceIntegrations: ReferenceIntegration[] = [
  {
    id: "better-auth",
    repository: "https://github.com/better-auth/better-auth.git",
    revision: "e84ec5e",
    sourcePaths: [
      "demo/nextjs/components/forms/create-organization-form.tsx",
      "demo/nextjs/components/forms/two-factor-totp-form.tsx",
      "demo/nextjs/lib/auth.ts",
    ],
    applicationBoundary: "packages/auth/src/better-auth-config.ts",
    activation: "external-service",
  },
  {
    id: "postiz",
    repository: "https://github.com/gitroomhq/postiz-app.git",
    revision: "4e959fa",
    sourcePaths: [
      "libraries/nestjs-libraries/src/integrations/social/social.abstract.ts",
      "libraries/nestjs-libraries/src/integrations/social/facebook.provider.ts",
      "libraries/nestjs-libraries/src/integrations/social/tiktok.provider.ts",
      "libraries/nestjs-libraries/src/integrations/social/youtube.provider.ts",
      "libraries/nestjs-libraries/src/integrations/social/linkedin.provider.ts",
    ],
    applicationBoundary: "packages/social/src/adapters/postiz-adapters.ts",
    activation: "external-service",
  },
  {
    id: "lago",
    repository: "https://github.com/getlago/lago.git",
    revision: "330f78f",
    sourcePaths: ["api", "billing", "docker-compose.yml"],
    applicationBoundary: "packages/platform/src/index.ts::LagoBillingAdapter",
    activation: "external-service",
  },
  {
    id: "growthbook",
    repository: "https://github.com/growthbook/growthbook.git",
    revision: "6fa4176",
    sourcePaths: ["packages", "apps", "docker-compose.yml"],
    applicationBoundary: "packages/platform/src/index.ts::GrowthBookAdapter",
    activation: "external-service",
  },
  {
    id: "novu",
    repository: "https://github.com/novuhq/novu.git",
    revision: "3f6bb54",
    sourcePaths: ["apps/api", "apps/webhook", "docker/community/docker-compose.yml"],
    applicationBoundary: "packages/platform/src/index.ts::NovuNotificationAdapter",
    activation: "external-service",
  },
  {
    id: "svix",
    repository: "https://github.com/svix/svix-webhooks.git",
    revision: "34f427e",
    sourcePaths: ["server", "bridge", "docker-compose.yml"],
    applicationBoundary: "packages/platform/src/index.ts::SvixCompatibleWebhookAdapter",
    activation: "external-service",
  },
];

export function getReferenceIntegration(id: ReferenceIntegration["id"]) {
  return referenceIntegrations.find((item) => item.id === id);
}
export function referenceCoverage() {
  return referenceIntegrations.map((item) => ({
    id: item.id,
    repository: item.repository,
    revision: item.revision,
    boundary: item.applicationBoundary,
    wired: Boolean(item.applicationBoundary),
  }));
}
