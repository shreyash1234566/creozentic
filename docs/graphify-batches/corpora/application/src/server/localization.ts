import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { ApiError } from "./api";
import { db } from "./db";
import { requireRole, type RequestContext } from "./auth";
import { providerApiError, requestProvider } from "./provider-http";
import { createMediaJob } from "./media-jobs";
import { isReleaseMode } from "./runtime-config";

export const LOCALE_PROFILES = {
  "hi-IN": { label: "Hindi", script: "Devanagari", direction: "ltr", currency: "INR" },
  "en-IN": { label: "Hinglish", script: "Latin", direction: "ltr", currency: "INR" },
  "ta-IN": { label: "Tamil", script: "Tamil", direction: "ltr", currency: "INR" },
  "mr-IN": { label: "Marathi", script: "Devanagari", direction: "ltr", currency: "INR" },
  "ar-AE": { label: "Arabic (UAE)", script: "Arabic", direction: "rtl", currency: "AED" },
} as const;

type Translation = { headline: string; cta: string };

function json(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function lockedTermsOk(text: string, terms: string[]) {
  return terms.every((term) => text.includes(term));
}

function requestHash(input: { sourceText: string; locales: string[]; lockedTerms: string[] }) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function layoutPreflight(locale: string, translation: Translation) {
  const rtl = LOCALE_PROFILES[locale as keyof typeof LOCALE_PROFILES]?.direction === "rtl";
  const headlineLimit = rtl ? 68 : 76;
  const ctaLimit = 34;
  const errors: string[] = [];
  if ([...translation.headline].length > headlineLimit)
    errors.push(`headline exceeds the ${headlineLimit}-character safe-area budget`);
  if ([...translation.cta].length > ctaLimit)
    errors.push(`CTA exceeds the ${ctaLimit}-character safe-area budget`);
  return { valid: errors.length === 0, errors, direction: rtl ? "rtl" : "ltr" };
}

async function translate(input: {
  sourceText: string;
  sourceCta?: string;
  locale: string;
  lockedTerms: string[];
}) {
  const endpoint = process.env.TEXT_PROVIDER_URL;
  if (
    !endpoint &&
    !isReleaseMode() &&
    process.env.NODE_ENV !== "production" &&
    process.env.LOCAL_TEXT_PROVIDER_ENABLED === "true"
  ) {
    const labels: Record<string, string> = {
      "hi-IN": "हिंदी संस्करण",
      "en-IN": "India version",
      "ta-IN": "தமிழ் பதிப்பு",
      "mr-IN": "मराठी आवृत्ती",
      "ar-AE": "نسخة الإمارات",
    };
    return {
      headline: `${input.sourceText} · ${labels[input.locale] ?? input.locale}`,
      cta: `${input.sourceCta ?? "Explore"} · ${labels[input.locale] ?? input.locale}`,
    } satisfies Translation;
  }
  if (!endpoint)
    throw new ApiError(
      503,
      "TEXT_PROVIDER_NOT_CONFIGURED",
      "Localization requires a configured TEXT_PROVIDER_URL adapter.",
    );
  try {
    const { body } = await requestProvider<unknown>({
      provider: "text-localization",
      endpoint,
      headers: process.env.TEXT_PROVIDER_API_KEY
        ? { authorization: `Bearer ${process.env.TEXT_PROVIDER_API_KEY}` }
        : undefined,
      idempotencyKey: `localization:${createHash("sha256").update(JSON.stringify(input)).digest("hex")}`,
      timeoutMs: Number(process.env.TEXT_PROVIDER_TIMEOUT_MS ?? 30_000),
      body: {
        operation: "localize",
        sourceText: input.sourceText,
        sourceCta: input.sourceCta,
        locale: input.locale,
        localeProfile: LOCALE_PROFILES[input.locale as keyof typeof LOCALE_PROFILES],
        lockedTerms: input.lockedTerms,
      },
    });
    const result =
      body && typeof body === "object" && "data" in body ? (body as { data: unknown }).data : body;
    if (!result || typeof result !== "object")
      throw new ApiError(
        502,
        "TEXT_PROVIDER_INVALID",
        "Text provider returned an invalid localization response.",
      );
    const value = result as Record<string, unknown>;
    const headline = typeof value.headline === "string" ? value.headline.trim() : "";
    const cta = typeof value.cta === "string" ? value.cta.trim() : "";
    if (!headline || !cta)
      throw new ApiError(
        502,
        "TEXT_PROVIDER_INVALID",
        "Localization response must contain headline and cta.",
      );
    return { headline, cta } satisfies Translation;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw providerApiError(error, "TEXT_PROVIDER_FAILED", "The text provider failed.");
  }
}

export async function createLocalizationJob(
  context: RequestContext,
  input: {
    sourceOutputId?: string;
    sourceText: string;
    sourceCta?: string;
    locales: string[];
    lockedTerms: string[];
    idempotencyKey: string;
  },
) {
  requireRole(context, "EDITOR");
  const sourceText = input.sourceText.trim();
  const locales = [...new Set(input.locales.map((locale) => locale.trim()))];
  const lockedTerms = [...new Set(input.lockedTerms.map((term) => term.trim()).filter(Boolean))];
  if (!sourceText || sourceText.length > 2000)
    throw new ApiError(
      400,
      "INVALID_LOCALIZATION",
      "sourceText must contain 1 to 2000 characters.",
    );
  if (
    locales.length < 1 ||
    locales.length > 10 ||
    locales.some((locale) => !(locale in LOCALE_PROFILES))
  )
    throw new ApiError(400, "INVALID_LOCALE", "Select one to ten supported locales.");
  if (!lockedTerms.every((term) => sourceText.includes(term)))
    throw new ApiError(
      400,
      "LOCKED_TERM_MISSING",
      "Every locked term must exist in the source text.",
    );
  const sourceOutput = input.sourceOutputId
    ? await db.outputAsset.findFirst({
        where: { id: input.sourceOutputId, workspaceId: context.workspaceId },
        include: { run: { include: { reviewTask: true } }, asset: true },
      })
    : null;
  if (input.sourceOutputId) {
    const output = sourceOutput;
    if (!output)
      throw new ApiError(404, "OUTPUT_NOT_FOUND", "The source output is not in this workspace.");
    if (output.status !== "APPROVED" && output.status !== "EXPORTED")
      throw new ApiError(
        409,
        "LOCALIZATION_REQUIRES_APPROVAL",
        "Only an approved output can be localized.",
      );
    if (output.run.reviewTask?.status !== "APPROVED")
      throw new ApiError(
        409,
        "LOCALIZATION_REQUIRES_APPROVAL",
        "The source review must be approved first.",
      );
  }
  const hash = requestHash({ sourceText, locales, lockedTerms });
  const existing = await db.localizationJob.findUnique({
    where: {
      workspaceId_idempotencyKey: {
        workspaceId: context.workspaceId,
        idempotencyKey: input.idempotencyKey,
      },
    },
    include: { variants: true },
  });
  if (existing) return { job: existing, deduplicated: true };
  const job = await db.localizationJob.create({
    data: {
      workspaceId: context.workspaceId,
      sourceOutputId: input.sourceOutputId,
      sourceText,
      lockedTerms: json(lockedTerms),
      locales: json(locales),
      status: "RUNNING",
      idempotencyKey: input.idempotencyKey,
      createdBy: context.userId,
      variants: { create: locales.map((locale) => ({ workspaceId: context.workspaceId, locale })) },
    },
    include: { variants: true },
  });
  try {
    for (const locale of locales) {
      const translation = await translate({
        sourceText,
        sourceCta: input.sourceCta,
        locale,
        lockedTerms,
      });
      const lockedTermsValid = lockedTermsOk(
        `${translation.headline} ${translation.cta}`,
        lockedTerms,
      );
      const layout = layoutPreflight(locale, translation);
      const valid = lockedTermsValid && layout.valid;
      let outputAssetId: string | undefined;
      if (valid && sourceOutput?.assetId && sourceOutput.runId) {
        const rendered = await createMediaJob(context, {
          kind: "composition.render",
          sourceAssetIds: [sourceOutput.assetId],
          runId: sourceOutput.runId,
          config: {
            templateId: `localization:${sourceOutput.format}:v1`,
            ratio: sourceOutput.format,
            locale,
            direction: layout.direction,
            layers: [
              {
                id: "headline",
                kind: "headline",
                text: translation.headline,
                x: layout.direction === "rtl" ? 92 : 8,
                y: 58,
              },
              {
                id: "cta",
                kind: "cta",
                text: translation.cta,
                x: layout.direction === "rtl" ? 92 : 8,
                y: 80,
              },
            ],
          },
          idempotencyKey: `localization-render:${job.id}:${locale}`,
        });
        outputAssetId = `${rendered.job.id}-output-0`;
      }
      await db.localizationVariant.update({
        where: { jobId_locale: { jobId: job.id, locale } },
        data: {
          headline: translation.headline,
          cta: translation.cta,
          lockedTermsOk: lockedTermsValid,
          outputAssetId,
          status: valid ? "READY_FOR_REVIEW" : "BLOCKED",
          warnings: valid
            ? json([`Layout preflight passed (${layout.direction}).`])
            : json([
                ...(lockedTermsValid ? [] : ["A locked term changed or disappeared."]),
                ...layout.errors,
              ]),
        },
      });
    }
    return {
      job: await db.localizationJob.update({
        where: { id: job.id },
        data: { status: "READY_FOR_REVIEW" },
        include: { variants: true },
      }),
      deduplicated: false,
      requestHash: hash,
    };
  } catch (error) {
    await db.localizationJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        error: json({ message: error instanceof Error ? error.message : "Localization failed." }),
      },
    });
    throw error;
  }
}

export async function listLocalizationJobs(context: RequestContext) {
  return db.localizationJob.findMany({
    where: { workspaceId: context.workspaceId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { variants: true },
  });
}

export async function getLocalizationJob(context: RequestContext, jobId: string) {
  const job = await db.localizationJob.findFirst({
    where: { id: jobId, workspaceId: context.workspaceId },
    include: { variants: true },
  });
  if (!job)
    throw new ApiError(404, "LOCALIZATION_NOT_FOUND", "The localization job was not found.");
  return job;
}
