import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../src/server/auth";
import { idempotencyKey, jsonError } from "../../../../src/server/api";
import { createLocalizationJob, listLocalizationJobs } from "../../../../src/server/localization";

export async function GET(request: Request) {
  try {
    return NextResponse.json({
      data: await listLocalizationJobs(await getRequestContext(request)),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await getRequestContext(request);
    const body = (await request.json()) as Record<string, unknown>;
    const result = await createLocalizationJob(context, {
      sourceOutputId: typeof body.sourceOutputId === "string" ? body.sourceOutputId : undefined,
      sourceText: typeof body.sourceText === "string" ? body.sourceText : "",
      sourceCta: typeof body.sourceCta === "string" ? body.sourceCta : undefined,
      locales: Array.isArray(body.locales)
        ? body.locales.filter((value): value is string => typeof value === "string")
        : [],
      lockedTerms: Array.isArray(body.lockedTerms)
        ? body.lockedTerms.filter((value): value is string => typeof value === "string")
        : [],
      idempotencyKey: idempotencyKey(request, body.idempotencyKey),
    });
    return NextResponse.json({ data: result }, { status: result.deduplicated ? 200 : 201 });
  } catch (error) {
    return jsonError(error);
  }
}
