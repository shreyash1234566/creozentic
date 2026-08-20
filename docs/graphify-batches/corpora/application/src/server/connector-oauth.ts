import { ConnectionHealth, Prisma } from "@prisma/client";
import { ApiError } from "./api";
import { db } from "./db";
import { decryptConnectionSecret, encryptConnectionSecret } from "./secrets";

type NativeOAuthConfig = {
  provider: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  revokeEndpoint?: string;
  clientId?: string;
  clientSecret?: string;
  scopes: string[];
  scopeSeparator: " " | ",";
  authorizeClientParameter: "client_id" | "client_key";
  tokenClientParameter: "client_id" | "client_key";
};

function envName(provider: string, suffix: string) {
  return `CONNECTOR_${provider.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_${suffix}`;
}

function scopes(value: string | undefined, fallback: string[]) {
  const parsed = (value ?? "")
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return parsed.length ? parsed : fallback;
}

function googleConfig(provider: string): NativeOAuthConfig {
  const clientId =
    process.env.GOOGLE_OAUTH_CLIENT_ID ?? process.env[envName(provider, "CLIENT_ID")];
  const clientSecret =
    process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? process.env[envName(provider, "CLIENT_SECRET")];
  const defaultScopes =
    provider === "youtube"
      ? ["https://www.googleapis.com/auth/youtube.upload"]
      : ["https://www.googleapis.com/auth/drive.file"];
  return {
    provider,
    authorizationEndpoint:
      process.env[envName(provider, "OAUTH_AUTHORIZE_URL")] ??
      "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint:
      process.env[envName(provider, "OAUTH_TOKEN_URL")] ?? "https://oauth2.googleapis.com/token",
    revokeEndpoint: "https://oauth2.googleapis.com/revoke",
    clientId,
    clientSecret,
    scopes: scopes(process.env[envName(provider, "OAUTH_SCOPES")], defaultScopes),
    scopeSeparator: " ",
    authorizeClientParameter: "client_id",
    tokenClientParameter: "client_id",
  };
}

export function nativeOAuthConfig(rawProvider: string): NativeOAuthConfig {
  const provider = rawProvider.trim().toLowerCase();
  if (provider === "google-drive" || provider === "youtube") return googleConfig(provider);
  if (provider === "tiktok")
    return {
      provider,
      authorizationEndpoint:
        process.env[envName(provider, "OAUTH_AUTHORIZE_URL")] ??
        "https://www.tiktok.com/v2/auth/authorize/",
      tokenEndpoint:
        process.env[envName(provider, "OAUTH_TOKEN_URL")] ??
        "https://open.tiktokapis.com/v2/oauth/token/",
      revokeEndpoint: "https://open.tiktokapis.com/v2/oauth/revoke/",
      clientId: process.env.TIKTOK_CLIENT_KEY ?? process.env[envName(provider, "CLIENT_ID")],
      clientSecret:
        process.env.TIKTOK_CLIENT_SECRET ?? process.env[envName(provider, "CLIENT_SECRET")],
      scopes: scopes(process.env[envName(provider, "OAUTH_SCOPES")], ["user.info.basic"]),
      scopeSeparator: ",",
      authorizeClientParameter: "client_key",
      tokenClientParameter: "client_key",
    };
  if (["meta-instagram", "meta-ad", "whatsapp"].includes(provider))
    return {
      provider,
      authorizationEndpoint:
        process.env[envName(provider, "OAUTH_AUTHORIZE_URL")] ??
        "https://www.facebook.com/v22.0/dialog/oauth",
      tokenEndpoint:
        process.env[envName(provider, "OAUTH_TOKEN_URL")] ??
        "https://graph.facebook.com/v22.0/oauth/access_token",
      clientId: process.env.META_APP_ID ?? process.env[envName(provider, "CLIENT_ID")],
      clientSecret: process.env.META_APP_SECRET ?? process.env[envName(provider, "CLIENT_SECRET")],
      scopes: scopes(process.env[envName(provider, "OAUTH_SCOPES")], ["public_profile"]),
      scopeSeparator: ",",
      authorizeClientParameter: "client_id",
      tokenClientParameter: "client_id",
    };
  throw new ApiError(
    400,
    "UNSUPPORTED_NATIVE_OAUTH_PROVIDER",
    `Native OAuth is not defined for ${provider}. Configure its adapter explicitly.`,
  );
}

export function requireOAuthClient(config: NativeOAuthConfig) {
  if (!config.clientId || !config.clientSecret)
    throw new ApiError(
      503,
      "CONNECTOR_OAUTH_NOT_CONFIGURED",
      `Configure the OAuth client ID and secret for ${config.provider} before connecting it.`,
    );
  return { clientId: config.clientId, clientSecret: config.clientSecret };
}

export function buildAuthorizeUrl(config: NativeOAuthConfig, redirectUri: string, state: string) {
  const { clientId } = requireOAuthClient(config);
  const url = new URL(config.authorizationEndpoint);
  url.searchParams.set(config.authorizeClientParameter, clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", config.scopes.join(config.scopeSeparator));
  if (config.provider === "google-drive" || config.provider === "youtube") {
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
  }
  return url.toString();
}

async function tokenRequest(config: NativeOAuthConfig, params: Record<string, string>) {
  const { clientId, clientSecret } = requireOAuthClient(config);
  const payload = new URLSearchParams({
    [config.tokenClientParameter]: clientId,
    client_secret: clientSecret,
    ...params,
  });
  const response = await fetch(config.tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: payload,
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || typeof body.access_token !== "string")
    throw new ApiError(
      502,
      "CONNECTOR_TOKEN_EXCHANGE_FAILED",
      "The provider token exchange failed.",
      {
        provider: config.provider,
        providerError: body,
      },
    );
  return body;
}

export async function exchangeOAuthCode(
  config: NativeOAuthConfig,
  code: string,
  redirectUri: string,
) {
  return tokenRequest(config, {
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
}

export async function refreshConnectionToken(connectionId: string, workspaceId: string) {
  const connection = await db.connection.findFirst({ where: { id: connectionId, workspaceId } });
  if (!connection) throw new ApiError(404, "CONNECTION_NOT_FOUND", "The connection was not found.");
  const config = nativeOAuthConfig(connection.provider);
  const secret = decryptConnectionSecret(connection.encryptedRef);
  if (!secret.refreshToken)
    throw new ApiError(
      409,
      "CONNECTION_REAUTHORIZE_REQUIRED",
      "This connection has no refresh token.",
    );
  const body = await tokenRequest(config, {
    refresh_token: secret.refreshToken,
    grant_type: "refresh_token",
  });
  const expiresIn = typeof body.expires_in === "number" ? body.expires_in : undefined;
  return db.connection.update({
    where: { id: connection.id },
    data: {
      encryptedRef: encryptConnectionSecret({
        accessToken: body.access_token as string,
        refreshToken:
          typeof body.refresh_token === "string" ? body.refresh_token : secret.refreshToken,
      }),
      health: ConnectionHealth.HEALTHY,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
      metadata: {
        ...((connection.metadata as Record<string, unknown> | null) ?? {}),
        tokenType: typeof body.token_type === "string" ? body.token_type : undefined,
        refreshedAt: new Date().toISOString(),
        nativeOAuth: true,
      } as Prisma.InputJsonValue,
    },
    select: { id: true, provider: true, health: true, expiresAt: true, metadata: true },
  });
}

/** Returns a decrypted token only after refreshing a token that is about to expire. */
export async function usableConnectionAccessToken(connectionId: string, workspaceId: string) {
  let connection = await db.connection.findFirst({
    where: { id: connectionId, workspaceId, health: { in: ["HEALTHY", "EXPIRING"] } },
  });
  if (!connection)
    throw new ApiError(409, "CONNECTION_UNHEALTHY", "Reconnect the destination before using it.");
  if (connection.expiresAt && connection.expiresAt.getTime() <= Date.now() + 120_000) {
    await refreshConnectionToken(connection.id, workspaceId);
    connection = await db.connection.findFirst({ where: { id: connection.id, workspaceId } });
    if (!connection)
      throw new ApiError(
        409,
        "CONNECTION_UNHEALTHY",
        "The refreshed destination connection is unavailable.",
      );
  }
  return decryptConnectionSecret(connection.encryptedRef).accessToken;
}
