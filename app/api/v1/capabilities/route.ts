import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../src/server/auth";
import { jsonError } from "../../../../src/server/api";
import { listConfiguredProviders } from "../../../../src/server/gateway";
import { ROUTES } from "../../../../src/domain";
import { PLATFORM_SPECS } from "../../../../src/server/platform-specs";

export async function GET(request: Request) {
  try {
    await getRequestContext(request);
    return NextResponse.json({
      data: {
        modes: ["fast", "balanced", "quality"],
        routes: ROUTES.map((route) => ({
          id: route.id,
          label: route.label,
          capability: route.capability,
          qualityMode: route.qualityMode,
          supportsProductLock: route.supportsProductLock,
          supportedRatios: route.supportedRatios,
          unitsPerOutput: route.unitsPerOutput,
          avgSec: route.avgSec,
        })),
        configuredProviders: listConfiguredProviders(),
        platformSpecs: PLATFORM_SPECS,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
