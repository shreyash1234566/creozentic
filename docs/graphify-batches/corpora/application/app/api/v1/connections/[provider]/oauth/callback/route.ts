import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { ApiError, jsonError } from "../../../../../../../src/server/api";
import { db } from "../../../../../../../src/server/db";
import { encryptConnectionSecret } from "../../../../../../../src/server/secrets";
import {
  exchangeOAuthCode,
  nativeOAuthConfig,
} from "../../../../../../../src/server/connector-oauth";

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const { provider: rawProvider } = await params;
    const provider = rawProvider.toLowerCase();
    const query = new URL(request.url).searchParams;
    const code = query.get("code");
    const state = query.get("state");
    if (!code || !state)
      throw new ApiError(400, "INVALID_OAUTH_CALLBACK", "OAuth code and state are required.");
    const oauthState = await db.oAuthState.findUnique({
      where: { stateHash: createHash("sha256").update(state).digest("hex") },
    });
    if (
      !oauthState ||
      oauthState.provider !== provider ||
      oauthState.usedAt ||
      oauthState.expiresAt <= new Date()
    )
      throw new ApiError(401, "INVALID_OAUTH_STATE", "The OAuth state is invalid or expired.");
    const config = nativeOAuthConfig(provider);
    const redirectUri =
      process.env.CONNECTOR_OAUTH_CALLBACK_URL ??
      `${process.env.APP_URL ?? new URL(request.url).origin}/api/v1/connections/${provider}/oauth/callback`;
    const tokenBody = await exchangeOAuthCode(config, code, redirectUri);
    const expiresIn = typeof tokenBody.expires_in === "number" ? tokenBody.expires_in : undefined;
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined;
    const connection = await db.$transaction(async (tx) => {
      await tx.oAuthState.update({ where: { id: oauthState.id }, data: { usedAt: new Date() } });
      return tx.connection.upsert({
        where: { workspaceId_provider: { workspaceId: oauthState.workspaceId, provider } },
        update: {
          encryptedRef: encryptConnectionSecret({
            accessToken: tokenBody.access_token as string,
            refreshToken:
              typeof tokenBody.refresh_token === "string" ? tokenBody.refresh_token : undefined,
          }),
          scopes: Array.isArray(tokenBody.scope) ? tokenBody.scope : [],
          health: "HEALTHY",
          expiresAt,
          metadata: {
            ...(tokenBody.metadata && typeof tokenBody.metadata === "object"
              ? tokenBody.metadata
              : {}),
            tokenType: typeof tokenBody.token_type === "string" ? tokenBody.token_type : undefined,
            nativeOAuth: true,
          },
        },
        create: {
          workspaceId: oauthState.workspaceId,
          provider,
          encryptedRef: encryptConnectionSecret({
            accessToken: tokenBody.access_token as string,
            refreshToken:
              typeof tokenBody.refresh_token === "string" ? tokenBody.refresh_token : undefined,
          }),
          scopes: Array.isArray(tokenBody.scope) ? tokenBody.scope : [],
          health: "HEALTHY",
          expiresAt,
          metadata: {
            ...(tokenBody.metadata && typeof tokenBody.metadata === "object"
              ? tokenBody.metadata
              : {}),
            tokenType: typeof tokenBody.token_type === "string" ? tokenBody.token_type : undefined,
            nativeOAuth: true,
          },
        },
        select: { id: true, provider: true, health: true, expiresAt: true },
      });
    });
    return NextResponse.json({ data: connection });
  } catch (error) {
    return jsonError(error);
  }
}
