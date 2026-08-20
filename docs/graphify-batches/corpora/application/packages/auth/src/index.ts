import { z } from "zod";

export const authConfigSchema = z.object({
  issuer: z.string().url().optional(),
  secret: z.string().min(32),
  passkeysEnabled: z.boolean().default(true),
  totpEnabled: z.boolean().default(true),
  oauthProviders: z.array(z.enum(["google", "github", "microsoft", "apple"])).default([]),
});

export type AuthIdentity = {
  userId: string;
  organizationId: string;
  workspaceId: string;
  roles: string[];
  sessionId: string;
};
export type AuthAdapter = {
  createOrganization(input: {
    name: string;
    ownerUserId: string;
  }): Promise<{ organizationId: string }>;
  verifySession(input: { token: string }): Promise<AuthIdentity | null>;
  beginOAuth(input: {
    provider: string;
    redirectUri: string;
    state: string;
  }): Promise<{ url: string }>;
  registerPasskey(input: { userId: string; challenge: string; credential: unknown }): Promise<void>;
  verifyTotp(input: { userId: string; code: string }): Promise<boolean>;
};

export function policyForRole(role: string) {
  return {
    canRead: ["OWNER", "ADMIN", "EDITOR", "ANALYST", "VIEWER", "CLIENT", "REVIEWER"].includes(role),
    canEdit: ["OWNER", "ADMIN", "EDITOR", "STRATEGIST"].includes(role),
    canPublish: ["OWNER", "ADMIN", "PUBLISHER"].includes(role),
    canBill: ["OWNER", "ADMIN", "BILLING"].includes(role),
    canAdminister: ["OWNER", "ADMIN"].includes(role),
  };
}
