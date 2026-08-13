import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../src/server/auth";
import { jsonError } from "../../../../src/server/api";
import { generateCalendar, listCalendar } from "../../../../src/server/content-calendar";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    return NextResponse.json({
      data: await listCalendar(await getRequestContext(request), {
        weekStart: url.searchParams.get("weekStart") ?? undefined,
        brandId: url.searchParams.get("brandId") ?? undefined,
      }),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json(
      {
        data: await generateCalendar(await getRequestContext(request), {
          weekStart: typeof body.weekStart === "string" ? body.weekStart : undefined,
          brandId: typeof body.brandId === "string" ? body.brandId : undefined,
          channel: typeof body.channel === "string" ? body.channel : undefined,
          contentTypes: Array.isArray(body.contentTypes)
            ? body.contentTypes.filter((item): item is string => typeof item === "string")
            : undefined,
        }),
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
