import { CORE_ENGINE_MANIFEST } from "../packages/video/src/adopted-engines.ts";
import { referenceIntegrations } from "../packages/platform/src/reference-integrations.ts";

const requiredCore = [
  "openshorts",
  "ave",
  "pixeltable",
  "vimax",
  "videoagent",
  "videodb-director",
  "remotion",
  "comfyui",
  "temporal",
  "openchatcut",
  "openmontage",
  "twick",
] as const;

const requiredSupporting = ["better-auth", "postiz", "lago", "growthbook", "novu", "svix"] as const;

const coreIds = new Set(CORE_ENGINE_MANIFEST.map((engine) => engine.id));
const supportingIds = new Set(referenceIntegrations.map((integration) => integration.id));
const missingCore = requiredCore.filter((id) => !coreIds.has(id));
const missingSupporting = requiredSupporting.filter((id) => !supportingIds.has(id));
const invalidCore = CORE_ENGINE_MANIFEST.filter(
  (engine) =>
    !engine.repository.startsWith("https://github.com/") ||
    !engine.enabledBy.endsWith("_ENABLED") ||
    !engine.license,
);
const invalidSupporting = referenceIntegrations.filter(
  (integration) =>
    !integration.repository.startsWith("https://github.com/") || !integration.applicationBoundary,
);

if (
  missingCore.length ||
  missingSupporting.length ||
  invalidCore.length ||
  invalidSupporting.length
) {
  console.error(
    JSON.stringify({ missingCore, missingSupporting, invalidCore, invalidSupporting }, null, 2),
  );
  process.exit(1);
}

console.log(
  `PASS OSS completeness: ${CORE_ENGINE_MANIFEST.length} core boundaries + ${referenceIntegrations.length} supporting boundaries`,
);
