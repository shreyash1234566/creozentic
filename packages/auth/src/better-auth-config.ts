import { authConfigSchema, type AuthAdapter } from "./index";

export function createBetterAuthConfig(env: NodeJS.ProcessEnv = process.env) {
  return authConfigSchema.parse({
    issuer: env.AUTH_ISSUER,
    secret: env.AUTH_SESSION_SECRET,
    passkeysEnabled: env.AUTH_PASSKEYS_ENABLED !== "false",
    totpEnabled: env.AUTH_TOTP_ENABLED !== "false",
    oauthProviders: [
      env.AUTH_GOOGLE_CLIENT_ID ? "google" : undefined,
      env.AUTH_GITHUB_CLIENT_ID ? "github" : undefined,
      env.AUTH_MICROSOFT_CLIENT_ID ? "microsoft" : undefined,
      env.AUTH_APPLE_CLIENT_ID ? "apple" : undefined,
    ].filter(Boolean),
  });
}

export function createBetterAuthAdapter(baseUrl: string, apiKey: string): AuthAdapter {
  async function call(path: string, body: unknown) {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Better Auth adapter failed: ${response.status}`);
    return (await response.json()) as Record<string, unknown>;
  }
  return {
    async createOrganization(input) {
      const data = await call("organization/create", input);
      return { organizationId: String(data.id ?? data.organizationId) };
    },
    async verifySession(input) {
      const data = await call("session/verify", input);
      return (data.identity as Awaited<ReturnType<AuthAdapter["verifySession"]>>) ?? null;
    },
    async beginOAuth(input) {
      const data = await call("oauth/begin", input);
      return { url: String(data.url) };
    },
    async registerPasskey(input) {
      await call("passkey/register", input);
    },
    async verifyTotp(input) {
      const data = await call("totp/verify", input);
      return data.valid === true;
    },
  };
}
