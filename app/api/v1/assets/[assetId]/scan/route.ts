import { NextResponse } from "next/server";
import { getRequestContext, requireRole } from "../../../../../../src/server/auth";
import { ApiError, jsonError } from "../../../../../../src/server/api";
import {
  runAssetGate,
  runOptionalAssetScan,
} from "../../../../../../src/server/asset-intelligence";

export async function POST(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  try {
    const context = await getRequestContext(request);
    requireRole(context, "EDITOR");
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { assetId } = await params;
    const kind = typeof body.kind === "string" ? body.kind.toUpperCase() : "GATE";
    const data =
      kind === "GATE"
        ? await runAssetGate(context, assetId)
        : ["OCR", "MASKING"].includes(kind)
          ? await runOptionalAssetScan(context, assetId, kind as "OCR" | "MASKING")
          : (() => {
              throw new ApiError(400, "INVALID_SCAN_KIND", "kind must be GATE, OCR, or MASKING.");
            })();
    return NextResponse.json({ data });
  } catch (error) {
    return jsonError(error);
  }
}
