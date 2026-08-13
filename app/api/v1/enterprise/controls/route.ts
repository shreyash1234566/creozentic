import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../src/server/auth";
import { jsonError, ApiError } from "../../../../../src/server/api";
import { getEnterpriseControl, updateEnterpriseControl } from "../../../../../src/server/phase5";
export async function GET(request: Request) {
  try {
    return NextResponse.json({
      data: await getEnterpriseControl(await getRequestContext(request)),
    });
  } catch (error) {
    return jsonError(error);
  }
}
export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.dataRegion !== "string" || typeof body.retentionDays !== "number")
      throw new ApiError(
        400,
        "INVALID_ENTERPRISE_CONTROL",
        "dataRegion and retentionDays are required.",
      );
    return NextResponse.json({
      data: await updateEnterpriseControl(await getRequestContext(request), {
        dataRegion: body.dataRegion.toUpperCase(),
        retentionDays: body.retentionDays,
        auditExport: body.auditExport !== false,
        ssoRequired: body.ssoRequired === true,
        ssoProvider: typeof body.ssoProvider === "string" ? body.ssoProvider : undefined,
        ssoMetadata:
          body.ssoMetadata &&
          typeof body.ssoMetadata === "object" &&
          !Array.isArray(body.ssoMetadata)
            ? (body.ssoMetadata as Record<string, unknown>)
            : {},
      }),
    });
  } catch (error) {
    return jsonError(error);
  }
}
