import { NextResponse } from "next/server";
import { Prisma, ProductLockMode } from "@prisma/client";
import { getRequestContext, requireRole } from "../../../../../src/server/auth";
import { ApiError, jsonError } from "../../../../../src/server/api";
import { db } from "../../../../../src/server/db";
import { parseCsvRows, parseXlsxRows } from "../../../../../src/server/tabular-import";

type ProductRow = Record<string, unknown>;

function text(row: ProductRow, key: string) {
  return typeof row[key] === "string" ? row[key].trim() : "";
}

function number(row: ProductRow, key: string) {
  const value = row[key];
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value)))
    return Math.round(Number(value));
  return undefined;
}

function list(row: ProductRow, key: string) {
  const value = row[key];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return typeof value === "string"
    ? value
        .split(/[|;]/)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function jsonObject(value: unknown): Prisma.InputJsonValue {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Prisma.InputJsonObject)
    : {};
}

function mapColumns(rows: ProductRow[], value: unknown) {
  if (value === undefined) return rows;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ApiError(
      400,
      "INVALID_COLUMN_MAP",
      "columnMap must map product fields to source headers.",
    );
  const map = Object.entries(value as Record<string, unknown>).flatMap(([target, source]) =>
    typeof source === "string" && source.trim() ? [[target, source.trim()] as const] : [],
  );
  if (!map.length)
    throw new ApiError(400, "INVALID_COLUMN_MAP", "columnMap must contain mappings.");
  return rows.map((row) => ({
    ...row,
    ...Object.fromEntries(map.map(([target, source]) => [target, row[source]])),
  }));
}

export async function POST(request: Request) {
  try {
    const context = await getRequestContext(request);
    requireRole(context, "EDITOR");
    const body = (await request.json()) as Record<string, unknown>;
    const rawRows = Array.isArray(body.products)
      ? body.products
      : Array.isArray(body.rows)
        ? body.rows
        : typeof body.csv === "string"
          ? parseCsvRows(body.csv)
          : typeof body.xlsxBase64 === "string"
            ? parseXlsxRows(body.xlsxBase64)
            : [];
    const rows = mapColumns(
      rawRows.filter((row): row is ProductRow => Boolean(row && typeof row === "object")),
      body.columnMap,
    );
    if (rows.length === 0 || rows.length > 1000)
      throw new ApiError(
        400,
        "INVALID_PRODUCT_IMPORT",
        "products must contain between 1 and 1000 rows.",
      );

    const errors: Array<{ row: number; message: string }> = [];
    const valid = rows.flatMap((value, index) => {
      if (!value || typeof value !== "object") {
        errors.push({ row: index + 1, message: "Each row must be an object." });
        return [];
      }
      const row = value as ProductRow;
      const sku = text(row, "sku");
      const title = text(row, "title");
      if (!sku || !title) {
        errors.push({ row: index + 1, message: "sku and title are required." });
        return [];
      }
      const lockMode =
        text(row, "lockMode").toUpperCase() === "CREATIVE"
          ? ProductLockMode.CREATIVE
          : ProductLockMode.PRODUCT_LOCK;
      return [{ row, sku, title, lockMode }];
    });
    if (valid.length === 0)
      throw new ApiError(400, "INVALID_PRODUCT_IMPORT", "No valid product rows were provided.", {
        errors,
      });

    if (body.dryRun === true)
      return NextResponse.json({
        data: {
          dryRun: true,
          received: rows.length,
          valid: valid.length,
          errors,
          estimatedCredits: valid.length * 6,
          requiredColumns: ["sku", "title"],
        },
      });

    const imported = await db.$transaction(async (tx) => {
      const products = [];
      for (const item of valid) {
        const row = item.row;
        const brandId = typeof row.brandId === "string" ? row.brandId : undefined;
        if (brandId) {
          const brand = await tx.brand.findFirst({
            where: { id: brandId, workspaceId: context.workspaceId },
            select: { id: true },
          });
          if (!brand) {
            errors.push({
              row: rows.indexOf(row) + 1,
              message: "brandId does not belong to this workspace.",
            });
            continue;
          }
        }
        const product = await tx.product.upsert({
          where: { workspaceId_sku: { workspaceId: context.workspaceId, sku: item.sku } },
          update: {
            brandId,
            title: item.title,
            description: typeof row.description === "string" ? row.description : undefined,
            priceMinor: number(row, "priceMinor"),
            currency: typeof row.currency === "string" ? row.currency.toUpperCase() : undefined,
            material: typeof row.material === "string" ? row.material : undefined,
            dimensions: typeof row.dimensions === "string" ? row.dimensions : undefined,
            variant: typeof row.variant === "string" ? row.variant : undefined,
            lockMode: item.lockMode,
            facts: jsonObject(row.facts),
            claimRestrictions: list(row, "claimRestrictions") as Prisma.InputJsonValue,
            sourceAssetIds: list(row, "sourceAssetIds") as Prisma.InputJsonValue,
          },
          create: {
            workspaceId: context.workspaceId,
            brandId,
            sku: item.sku,
            title: item.title,
            description: typeof row.description === "string" ? row.description : undefined,
            priceMinor: number(row, "priceMinor"),
            currency: typeof row.currency === "string" ? row.currency.toUpperCase() : "INR",
            material: typeof row.material === "string" ? row.material : undefined,
            dimensions: typeof row.dimensions === "string" ? row.dimensions : undefined,
            variant: typeof row.variant === "string" ? row.variant : undefined,
            lockMode: item.lockMode,
            facts: jsonObject(row.facts),
            claimRestrictions: list(row, "claimRestrictions") as Prisma.InputJsonValue,
            sourceAssetIds: list(row, "sourceAssetIds") as Prisma.InputJsonValue,
          },
        });
        products.push(product);
      }
      await tx.auditEvent.create({
        data: {
          workspaceId: context.workspaceId,
          actorId: context.userId,
          action: "products.imported",
          targetType: "product",
          targetId: products[0]?.id ?? "none",
          correlationId: request.headers.get("x-correlation-id") ?? crypto.randomUUID(),
          metadata: { received: rows.length, imported: products.length, errors },
        },
      });
      return products;
    });
    return NextResponse.json(
      { data: { products: imported, imported: imported.length, errors } },
      { status: errors.length > 0 ? 207 : 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
