import { loadEnvFile } from "node:process";
import { Prisma, PrismaClient } from "@prisma/client";

try {
  loadEnvFile(".env");
} catch {
  // Production and CI inject DATABASE_URL directly; local CLI runs use .env.
}

const prisma = new PrismaClient();

const brandProfile = {
  tagline: "Modern living, made in Jaipur.",
  tone: "Warm, aspirational, uncluttered.",
  colors: ["#1f2a44", "#c98a3a", "#f2ede3", "#7a8b6f"],
  fonts: "Fraunces / Inter",
  vertical: "Furniture",
  language: "Hinglish",
  category: "Furniture and home décor",
  audience: "Young Indian families setting up their first home",
  locations: ["Jaipur", "Delhi NCR", "Mumbai"],
  preferredLanguages: ["Hinglish", "Hindi", "English"],
  allowedColors: ["#1f2a44", "#c98a3a", "#f2ede3", "#7a8b6f"],
  forbiddenColors: ["neon pink", "fluorescent green"],
  preferredWords: ["crafted", "warm", "made for living"],
  prohibitedWords: ["best in India", "guaranteed", "cheap"],
  claimSensitiveTerms: ["solid wood", "lifetime", "discount", "guaranteed"],
  logoPlacement: "Top-left with 8% clear space",
  safeArea: "Keep headline and CTA 12% from platform edges",
  productTruthRules:
    "Product shape, count, material, packaging text, dimensions, and colour must never silently change.",
  disclosureRequired: true,
};

async function main() {
  const owner = await prisma.user.upsert({
    where: { id: "user-autozentic-owner" },
    update: { name: "Aarav Mehta", email: "aarav@autozentic.in" },
    create: {
      id: "user-autozentic-owner",
      name: "Aarav Mehta",
      email: "aarav@autozentic.in",
      externalId: "demo-owner",
    },
  });

  const workspace = await prisma.workspace.upsert({
    where: { id: "workspace-autozentic-demo" },
    update: { name: "Autozentic Demo Workspace", ownerId: owner.id },
    create: {
      id: "workspace-autozentic-demo",
      slug: "autozentic-demo",
      name: "Autozentic Demo Workspace",
      ownerId: owner.id,
      plan: "studio",
    },
  });

  await prisma.membership.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: owner.id } },
    update: { role: "OWNER", status: "ACTIVE" },
    create: { workspaceId: workspace.id, userId: owner.id, role: "OWNER", status: "ACTIVE" },
  });

  const brand = await prisma.brand.upsert({
    where: { workspaceId_name: { workspaceId: workspace.id, name: "Kosmic Furniture" } },
    update: {
      version: 7,
      approvalStatus: "APPROVED",
      approvedBy: owner.id,
      approvedAt: new Date("2026-01-01T00:00:00.000Z"),
      profile: brandProfile as Prisma.InputJsonValue,
    },
    create: {
      workspaceId: workspace.id,
      name: "Kosmic Furniture",
      version: 7,
      approvalStatus: "APPROVED",
      approvedBy: owner.id,
      approvedAt: new Date("2026-01-01T00:00:00.000Z"),
      profile: brandProfile as Prisma.InputJsonValue,
    },
  });

  const product = await prisma.product.upsert({
    where: { workspaceId_sku: { workspaceId: workspace.id, sku: "KOS-SOF-114" } },
    update: {},
    create: {
      workspaceId: workspace.id,
      brandId: brand.id,
      sku: "KOS-SOF-114",
      title: "Kadam 3-seater sofa",
      priceMinor: 4299000,
      material: "Teak + boucle",
      dimensions: "210×92×85 cm",
      variant: "Oat",
      facts: { seatCount: 3, material: "Teak + boucle", colour: "Oat" },
      claimRestrictions: ["fabric colour", "leg finish", "seat count"],
      sourceAssetIds: [],
    },
  });

  const sourceAsset = await prisma.asset.upsert({
    where: {
      workspaceId_contentHash: { workspaceId: workspace.id, contentHash: "demo-kadam-source-v1" },
    },
    update: { productId: product.id, brandId: brand.id, status: "IMMUTABLE" },
    create: {
      workspaceId: workspace.id,
      brandId: brand.id,
      productId: product.id,
      type: "ORIGINAL",
      status: "IMMUTABLE",
      name: "kadam-sofa-source.jpg",
      objectKey: "workspaces/workspace-autozentic-demo/assets/kadam-sofa-source.jpg",
      contentHash: "demo-kadam-source-v1",
      mimeType: "image/jpeg",
      metadata: { source: "seed", rights: "demo-only" },
    },
  });
  await prisma.product.update({
    where: { id: product.id },
    data: { sourceAssetIds: [sourceAsset.id] },
  });

  const template = await prisma.workflowTemplate.upsert({
    where: { id: "workflow-product-photo-to-lifestyle" },
    update: { name: "Product photo to product-preserving lifestyle variants", publishedVersion: 1 },
    create: {
      id: "workflow-product-photo-to-lifestyle",
      workspaceId: workspace.id,
      ownerId: owner.id,
      name: "Product photo to product-preserving lifestyle variants",
      category: "product-creative",
      visibility: "WORKSPACE",
      publishedVersion: 1,
    },
  });

  await prisma.workflowVersion.upsert({
    where: { templateId_version: { templateId: template.id, version: "v1.0.0" } },
    update: {},
    create: {
      templateId: template.id,
      version: "v1.0.0",
      graph: {
        nodes: ["validate", "mask", "environment", "composite", "quality", "review", "export"],
      },
      inputSchema: { required: ["product", "sku", "scene", "count", "mode", "outputFormats"] },
      permissions: { required: ["asset.read", "brand.read", "credits.reserve", "review.create"] },
      costFormula: { unit: "variant", balanced: 1, quality: 2 },
    },
  });

  const lockedTemplateSchema = {
    safeArea: { left: 8, top: 8, right: 8, bottom: 8 },
    protectedSourceAsset: true,
    slots: {
      headline: { required: true, maxChars: 72, maxLines: 3 },
      body: { required: false, maxChars: 180, maxLines: 5 },
      cta: { required: true, maxChars: 40, maxLines: 1 },
      logo: { required: true, editable: false, value: brand.name, maxChars: 80 },
      disclosure: { required: false, maxChars: 120, maxLines: 2 },
    },
  } as Prisma.InputJsonValue;
  for (const name of ["daily-locked-poster", "autozentic-fixed-ad-v1"]) {
    await prisma.templateDefinition.upsert({
      where: { workspaceId_name_version: { workspaceId: workspace.id, name, version: "1.0.0" } },
      update: {
        brandId: brand.id,
        contentType: "static_social",
        schema: lockedTemplateSchema,
        lockedLayers: ["logo"],
        supportedFormats: ["feed", "story", "land", "1:1", "4:5", "9:16", "1.91:1"],
        status: "APPROVED",
        approvedBy: owner.id,
        approvedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      create: {
        workspaceId: workspace.id,
        brandId: brand.id,
        name,
        contentType: "static_social",
        version: "1.0.0",
        schema: lockedTemplateSchema,
        lockedLayers: ["logo"],
        supportedFormats: ["feed", "story", "land", "1:1", "4:5", "9:16", "1.91:1"],
        status: "APPROVED",
        createdBy: owner.id,
        approvedBy: owner.id,
        approvedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
  }

  await prisma.creditAccount.upsert({
    where: { workspaceId: workspace.id },
    update: {},
    create: { workspaceId: workspace.id, balance: 1000, reserved: 0, unitClass: "mixed" },
  });

  await prisma.ledgerEntry.upsert({
    where: {
      workspaceId_idempotencyKey: {
        workspaceId: workspace.id,
        idempotencyKey: "seed-starter-topup",
      },
    },
    update: {},
    create: {
      workspaceId: workspace.id,
      kind: "TOPUP",
      amount: 1000,
      reason: "Starter plan top-up",
      idempotencyKey: "seed-starter-topup",
    },
  });

  console.log(`Seeded ${workspace.name} (${workspace.id}) with ${brand.name} and ${product.sku}.`);
}

main().finally(() => prisma.$disconnect());
