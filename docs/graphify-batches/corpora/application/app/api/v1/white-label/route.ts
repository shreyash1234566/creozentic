import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../src/server/auth";
import { jsonError, ApiError } from "../../../../src/server/api";
import { getWhiteLabelConfig, updateWhiteLabelConfig } from "../../../../src/server/phase5";
export async function GET(request: Request) {
  try {
    return NextResponse.json({ data: await getWhiteLabelConfig(await getRequestContext(request)) });
  } catch (error) {
    return jsonError(error);
  }
}
export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.displayName !== "string" || typeof body.portalSlug !== "string")
      throw new ApiError(400, "INVALID_WHITE_LABEL", "displayName and portalSlug are required.");
    return NextResponse.json({
      data: await updateWhiteLabelConfig(await getRequestContext(request), {
        displayName: body.displayName,
        portalSlug: body.portalSlug,
        customDomain: typeof body.customDomain === "string" ? body.customDomain : undefined,
        supportEmail: typeof body.supportEmail === "string" ? body.supportEmail : undefined,
        logoAssetId: typeof body.logoAssetId === "string" ? body.logoAssetId : undefined,
        theme:
          body.theme && typeof body.theme === "object" && !Array.isArray(body.theme)
            ? (body.theme as Record<string, unknown>)
            : {},
        enabled: body.enabled === true,
      }),
    });
  } catch (error) {
    return jsonError(error);
  }
}
