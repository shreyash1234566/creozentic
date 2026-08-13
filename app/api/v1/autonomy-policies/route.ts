import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../src/server/auth";
import { ApiError, jsonError } from "../../../../src/server/api";
import {
  getAutonomyDefault,
  listAutonomyPolicies,
  saveAutonomyPolicy,
} from "../../../../src/server/daily-autopilot";

export async function GET(request: Request) {
  try {
    const context = await getRequestContext(request);
    if (new URL(request.url).searchParams.get("default") === "1")
      return NextResponse.json({ data: await getAutonomyDefault(context) });
    return NextResponse.json({ data: await listAutonomyPolicies(context) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await getRequestContext(request);
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.contentType !== "string" || typeof body.channel !== "string")
      throw new ApiError(400, "INVALID_AUTONOMY_POLICY", "contentType and channel are required.");
    return NextResponse.json(
      {
        data: await saveAutonomyPolicy(context, {
          brandId: typeof body.brandId === "string" ? body.brandId : undefined,
          contentType: body.contentType,
          channel: body.channel,
          mode: typeof body.mode === "string" ? body.mode : undefined,
          allowedTools: Array.isArray(body.allowedTools)
            ? body.allowedTools.filter((item): item is string => typeof item === "string")
            : undefined,
          budgetCredits: typeof body.budgetCredits === "number" ? body.budgetCredits : undefined,
          requiredApprovals: Array.isArray(body.requiredApprovals)
            ? body.requiredApprovals.filter((item): item is string => typeof item === "string")
            : undefined,
          escalationRules:
            body.escalationRules && typeof body.escalationRules === "object"
              ? (body.escalationRules as Record<string, unknown>)
              : undefined,
          approve: body.approve === true,
        }),
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
