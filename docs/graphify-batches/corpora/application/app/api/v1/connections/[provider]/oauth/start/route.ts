import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getRequestContext, requireRole } from "../../../../../../../src/server/auth";
import { ApiError, jsonError } from "../../../../../../../src/server/api";
import { db } from "../../../../../../../src/server/db";
import {
  buildAuthorizeUrl,
  nativeOAuthConfig,
} from "../../../../../../../src/server/connector-oauth";

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const context = await getRequestContext(request);
    requireRole(context, "ADMIN");
    const { provider: rawProvider } = await params;
    const provider = rawProvider.toLowerCase();
    const config = nativeOAuthConfig(provider);
    const state = randomBytes(32).toString("base64url");
    await db.oAuthState.create({
      data: {
        workspaceId: context.workspaceId,
        userId: context.userId,
        provider,
        stateHash: createHash("sha256").update(state).digest("hex"),
        expiresAt: new Date(Date.now() + 10 * 60000),
      },
    });
    const redirectUri =
      process.env.CONNECTOR_OAUTH_CALLBACK_URL ??
      `${process.env.APP_URL ?? new URL(request.url).origin}/api/v1/connections/${provider}/oauth/callback`;
    return NextResponse.json({
      data: {
        provider,
        authorizeUrl: buildAuthorizeUrl(config, redirectUri, state),
        expiresAt: new Date(Date.now() + 10 * 60000),
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
