import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getRequestContext, requireRole } from "../../../../src/server/auth";
import { ApiError, idempotencyKey, jsonError, requestId } from "../../../../src/server/api";
import { db } from "../../../../src/server/db";
import { enqueueWorkflowRun } from "../../../../src/server/queue";
import { createRun, failRunInternal, quoteBrief } from "../../../../src/server/workflow-service";
import { parseCsvRows } from "../../../../src/server/tabular-import";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function rowObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function GET(request: Request) {
  try {
    const context = await getRequestContext(request);
    const batches = await db.batchRun.findMany({
      where: { workspaceId: context.workspaceId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { rows: { orderBy: { rowNumber: "asc" } } },
    });
    return NextResponse.json({ data: batches });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await getRequestContext(request);
    requireRole(context, "EDITOR");
    const body = (await request.json()) as Record<string, unknown>;
    const rows = Array.isArray(body.rows)
      ? body.rows
      : typeof body.csv === "string"
        ? parseCsvRows(body.csv)
        : [];
    if (rows.length < 1 || rows.length > 1000)
      throw new ApiError(400, "INVALID_BATCH", "rows must contain between 1 and 1000 items.");
    const defaults = rowObject(body.briefDefaults) ?? {};
    const title = text(body.title) || "Catalogue creative batch";
    const key = idempotencyKey(request, body.idempotencyKey);
    const existing = await db.batchRun.findUnique({
      where: {
        workspaceId_idempotencyKey: { workspaceId: context.workspaceId, idempotencyKey: key },
      },
      include: { rows: true },
    });
    if (existing) return NextResponse.json({ data: existing }, { status: 200 });

    const evaluated: Array<{
      rowNumber: number;
      sku: string;
      brief: Record<string, unknown>;
      quote: ReturnType<typeof quoteBrief>["quote"];
    }> = [];
    const errors: Array<{ rowNumber: number; message: string }> = [];
    for (const [index, value] of rows.entries()) {
      const row = rowObject(value);
      const sku = text(row?.sku);
      if (!row || !sku) {
        errors.push({ rowNumber: index + 1, message: "sku is required." });
        continue;
      }
      const product = await db.product.findFirst({
        where: { workspaceId: context.workspaceId, sku, deletedAt: null },
        select: { title: true, lockMode: true },
      });
      if (!product) {
        errors.push({
          rowNumber: index + 1,
          message: `SKU ${sku} does not exist in this workspace.`,
        });
        continue;
      }
      const brief = {
        product: product.title,
        sku,
        scene: text(row.scene) || text(defaults.scene) || "warm lifestyle setting",
        count:
          typeof row.count === "number"
            ? row.count
            : typeof defaults.count === "number"
              ? defaults.count
              : 1,
        mode:
          text(row.mode) ||
          text(defaults.mode) ||
          (product.lockMode === "CREATIVE" ? "creative" : "lock"),
        qualityMode: text(row.qualityMode) || text(defaults.qualityMode) || "balanced",
        outputFormats: Array.isArray(row.outputFormats)
          ? row.outputFormats
          : Array.isArray(defaults.outputFormats)
            ? defaults.outputFormats
            : ["1:1", "4:5"],
        audience: text(row.audience) || text(defaults.audience) || "workspace audience",
        language: text(row.language) || text(defaults.language) || "English",
        cta: text(row.cta) || text(defaults.cta) || "Shop now",
      };
      try {
        const quoted = quoteBrief(brief);
        evaluated.push({
          rowNumber: index + 1,
          sku,
          brief: quoted.brief as unknown as Record<string, unknown>,
          quote: quoted.quote,
        });
      } catch (error) {
        errors.push({
          rowNumber: index + 1,
          message: error instanceof Error ? error.message : "The row brief is invalid.",
        });
      }
    }
    const estimate = {
      credits: evaluated.reduce((sum, item) => sum + item.quote.credits, 0),
      etaSec: evaluated.reduce((sum, item) => sum + item.quote.etaSec, 0),
      validRows: evaluated.length,
      failedRows: errors.length,
    };
    if (body.dryRun === true)
      return NextResponse.json({ data: { dryRun: true, estimate, errors } });
    if (evaluated.length === 0)
      throw new ApiError(400, "INVALID_BATCH", "No valid rows are available to run.", { errors });

    const batch = await db.batchRun.create({
      data: {
        workspaceId: context.workspaceId,
        createdBy: context.userId,
        title,
        state: "QUEUED",
        totalRows: rows.length,
        failedRows: errors.length,
        estimatedUnits: estimate.credits,
        idempotencyKey: key,
        rows: {
          create: rows.map((value, index) => {
            const valid = evaluated.find((item) => item.rowNumber === index + 1);
            const invalid = errors.find((item) => item.rowNumber === index + 1);
            return {
              workspaceId: context.workspaceId,
              rowNumber: index + 1,
              sku: (valid?.sku ?? text(rowObject(value)?.sku)) || `row-${index + 1}`,
              inputSnapshot: (rowObject(value) ?? {}) as Prisma.InputJsonValue,
              state: invalid ? "FAILED" : "VALIDATED",
              error: invalid ? { message: invalid.message } : undefined,
            };
          }),
        },
      },
      include: { rows: true },
    });

    let queuedRows = 0;
    let failedRows = errors.length;
    for (const item of evaluated) {
      const batchRow = batch.rows.find((row) => row.rowNumber === item.rowNumber);
      if (!batchRow) continue;
      try {
        const result = await createRun(context, {
          title: `${title} · ${item.sku}`,
          brief: item.brief,
          idempotencyKey: `${batch.id}:${item.rowNumber}:${item.sku}`,
        });
        const queue = await enqueueWorkflowRun({
          runId: result.run.id,
          workspaceId: context.workspaceId,
          correlationId: requestId(request),
        });
        if (!queue.accepted) {
          await failRunInternal({
            workspaceId: context.workspaceId,
            runId: result.run.id,
            correlationId: requestId(request),
            error: {
              code: "QUEUE_NOT_CONFIGURED",
              message: queue.reason ?? "The queue could not accept this row.",
            },
          });
          failedRows += 1;
          await db.batchRow.update({
            where: { id: batchRow.id },
            data: {
              state: "FAILED",
              runId: result.run.id,
              error: {
                code: "QUEUE_NOT_CONFIGURED",
                message: queue.reason ?? "The queue could not accept this row.",
              },
            },
          });
        } else {
          queuedRows += 1;
          await db.batchRow.update({
            where: { id: batchRow.id },
            data: { state: "QUEUED", runId: result.run.id },
          });
        }
      } catch (error) {
        failedRows += 1;
        await db.batchRow.update({
          where: { id: batchRow.id },
          data: {
            state: "FAILED",
            error: {
              message: error instanceof Error ? error.message : "The row could not be queued.",
            },
          },
        });
      }
    }
    const updated = await db.batchRun.update({
      where: { id: batch.id },
      data: { state: queuedRows > 0 ? "RUNNING" : "PARTIAL_FAILURE", failedRows },
      include: { rows: { orderBy: { rowNumber: "asc" } } },
    });
    return NextResponse.json(
      { data: { batch: updated, estimate, errors, queuedRows } },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
