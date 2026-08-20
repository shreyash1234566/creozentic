import { ApiError } from "./api";

const placeholder = /replace-with|<account>|^\s*$/i;

function configured(name: string) {
  const value = process.env[name];
  return Boolean(value && !placeholder.test(value));
}

/**
 * Release mode is explicit so a hosted development/staging deployment cannot
 * accidentally inherit permissive local identity behavior from NODE_ENV.
 */
export function isReleaseMode() {
  return process.env.CREOZENTIC_RELEASE_MODE === "true";
}

/** Production hosts remain authenticated even if the explicit release gate was omitted. */
export function requiresProductionAuthentication() {
  return isReleaseMode() || process.env.NODE_ENV === "production";
}

export function productionConfigurationProblems() {
  if (!isReleaseMode()) return [];
  const required = [
    "DATABASE_URL",
    "REDIS_URL",
    "APP_URL",
    "AUTH_SESSION_SECRET",
    "CONNECTION_ENCRYPTION_KEY",
    "RUNNER_TOKEN",
    "S3_ENDPOINT",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
  ];
  const missing = required.filter((name) => !configured(name));
  if (!configured("CREATIVE_PROVIDER_URL") && !configured("CREATIVE_PROVIDER_ENDPOINTS"))
    missing.push("CREATIVE_PROVIDER_URL or CREATIVE_PROVIDER_ENDPOINTS");
  for (const name of [
    "TEXT_PROVIDER_URL",
    "MEDIA_RENDERER_URL",
    "MEDIA_ANALYSIS_PROVIDER_URL",
    "OCR_PROVIDER_URL",
    "MASKING_PROVIDER_URL",
    "INTEGRITY_PROVIDER_URL",
    "MALWARE_SCAN_PROVIDER_URL",
    "MODERATION_PROVIDER_URL",
  ]) {
    if (!configured(name)) missing.push(name);
  }
  return missing;
}

export function assertProductionConfiguration(component = "service") {
  const missing = productionConfigurationProblems();
  if (missing.length)
    throw new ApiError(
      503,
      "PRODUCTION_CONFIGURATION_INVALID",
      `${component} cannot start in release mode until required production configuration is supplied.`,
      { missing },
    );
}
