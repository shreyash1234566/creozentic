import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { MembershipRole, MembershipStatus } from "@prisma/client";
import { db } from "./db";
import { ApiError } from "./api";
import { enforceRateLimit } from "./rate-limit";

export type RequestContext = {
  workspaceId: string;
  userId: string;
  role: MembershipRole;
  correlationId: string;
};

const roleRank: Record<MembershipRole, number> = {
  VIEWER: 1,
  CLIENT: 1,
  REVIEWER: 2,
  EDITOR: 3,
  STRATEGIST: 3,
  PUBLISHER: 4,
  BILLING: 4,
  ADMIN: 4,
  OWNER: 5,
};

type SessionClaims = { sub: string; workspaceId: string; exp: number; iat?: number };

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function verifySessionToken(token: string, secret: string): SessionClaims | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = createHmac("sha256", secret).update(encoded).digest("base64url");
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signature);
  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !timingSafeEqual(expectedBuffer, receivedBuffer)
  )
    return null;
  try {
    const claims = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionClaims;
    if (
      !claims.sub ||
      !claims.workspaceId ||
      !Number.isFinite(claims.exp) ||
      claims.exp <= Math.floor(Date.now() / 1000)
    )
      return null;
    return claims;
  } catch {
    return null;
  }
}

function sessionTokenFromCookie(request: Request) {
  const cookieName = process.env.AUTH_SESSION_COOKIE ?? "creozentic_session";
  const cookies =
    request.headers
      .get("cookie")
      ?.split(";")
      .map((item) => item.trim()) ?? [];
  const value = cookies.find((item) => item.startsWith(`${cookieName}=`));
  return value ? decodeURIComponent(value.slice(cookieName.length + 1)) : undefined;
}

export function createSessionToken(
  claims: { userId: string; workspaceId: string; expiresInSeconds?: number },
  secret = process.env.AUTH_SESSION_SECRET,
) {
  if (!secret)
    throw new ApiError(
      500,
      "AUTH_SECRET_NOT_CONFIGURED",
      "AUTH_SESSION_SECRET is required to mint session tokens.",
    );
  const payload: SessionClaims = {
    sub: claims.userId,
    workspaceId: claims.workspaceId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (claims.expiresInSeconds ?? 3600),
  };
  const encoded = base64Url(JSON.stringify(payload));
  return `${encoded}.${createHmac("sha256", secret).update(encoded).digest("base64url")}`;
}

async function identityFromApiKey(request: Request, workspaceId: string) {
  const raw = request.headers.get("x-api-key");
  if (!raw) return null;
  const keyHash = createHash("sha256").update(raw).digest("hex");
  const apiKey = await db.apiKey.findFirst({
    where: {
      workspaceId,
      keyHash,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { userId: true },
  });
  if (!apiKey) return null;
  void db.apiKey.updateMany({ where: { workspaceId, keyHash }, data: { lastUsedAt: new Date() } });
  return { userId: apiKey.userId, workspaceId };
}

export async function getRequestContext(request: Request): Promise<RequestContext> {
  const isProduction = process.env.NODE_ENV === "production";
  const headerWorkspaceId = request.headers.get("x-workspace-id");
  const bearer =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    sessionTokenFromCookie(request);
  const session =
    bearer && process.env.AUTH_SESSION_SECRET
      ? verifySessionToken(bearer, process.env.AUTH_SESSION_SECRET)
      : null;
  const apiKeyIdentity = headerWorkspaceId
    ? await identityFromApiKey(request, headerWorkspaceId)
    : null;
  const identity = session
    ? { userId: session.sub, workspaceId: session.workspaceId }
    : apiKeyIdentity;
  const workspaceId =
    identity?.workspaceId ??
    headerWorkspaceId ??
    (!isProduction ? process.env.DEMO_WORKSPACE_ID : undefined);
  const userId =
    identity?.userId ??
    request.headers.get("x-user-id") ??
    (!isProduction ? process.env.DEMO_USER_ID : undefined);
  const correlationId = request.headers.get("x-correlation-id") ?? crypto.randomUUID();

  if (isProduction && !identity)
    throw new ApiError(401, "AUTH_REQUIRED", "A valid bearer session or API key is required.");
  if (identity && headerWorkspaceId && identity.workspaceId !== headerWorkspaceId)
    throw new ApiError(
      403,
      "WORKSPACE_ACCESS_DENIED",
      "The authenticated workspace does not match the requested workspace.",
    );
  if (!workspaceId || !userId) {
    throw new ApiError(401, "AUTH_REQUIRED", "A signed-in user and workspace are required.");
  }

  const membership = await db.membership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true, status: true },
  });

  if (!membership || membership.status !== MembershipStatus.ACTIVE) {
    throw new ApiError(
      403,
      "WORKSPACE_ACCESS_DENIED",
      "This user is not an active member of the workspace.",
    );
  }

  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { status: true, spendingCap: true, region: true },
  });
  if (!workspace || workspace.status !== "ACTIVE")
    throw new ApiError(403, "WORKSPACE_UNAVAILABLE", "This workspace is not active.");
  const planLimit = workspace.spendingCap
    ? Math.min(600, Math.max(60, workspace.spendingCap * 2))
    : 240;
  await enforceRateLimit(`workspace:${workspaceId}:user:${userId}`, planLimit, 60);
  await enforceRateLimit(
    `workspace:${workspaceId}:route:${new URL(request.url).pathname}`,
    120,
    60,
  );
  const enterprise = await db.enterpriseControl.findUnique({
    where: { workspaceId },
    select: { ssoRequired: true, ssoProvider: true },
  });
  if (enterprise?.ssoRequired) {
    const assertion = request.headers.get("x-sso-assertion");
    const endpoint = process.env.ENTERPRISE_SSO_VALIDATE_URL;
    if (!assertion || !endpoint) {
      throw new ApiError(
        403,
        "ENTERPRISE_SSO_REQUIRED",
        `Enterprise SSO is required${enterprise.ssoProvider ? ` via ${enterprise.ssoProvider}` : ""}; configure the SSO validation adapter before enabling enforcement.`,
      );
    }
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ assertion, workspaceId, userId }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    const result = response
      ? ((await response.json().catch(() => ({}))) as Record<string, unknown>)
      : {};
    if (!response?.ok || result.valid !== true)
      throw new ApiError(
        403,
        "ENTERPRISE_SSO_INVALID",
        "The enterprise SSO assertion could not be validated.",
      );
  }

  return { workspaceId, userId, role: membership.role, correlationId };
}

export function requireRole(context: RequestContext, minimum: MembershipRole) {
  if (roleRank[context.role] < roleRank[minimum]) {
    throw new ApiError(
      403,
      "ROLE_REQUIRED",
      `This action requires ${minimum.toLowerCase()} access.`,
    );
  }
}
