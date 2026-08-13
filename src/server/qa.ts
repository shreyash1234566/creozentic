import type { QualityCheck, ProductLockBrief } from "../domain";

type CreativeOutput = {
  width?: number;
  height?: number;
  objectKey?: string;
  contentHash?: string;
  metadata?: Record<string, unknown>;
  format?: string;
};

export function evaluateCreativeOutputs(
  brief: ProductLockBrief,
  outputs: CreativeOutput[],
): Record<string, QualityCheck> {
  const metadata = outputs.map((output) => output.metadata ?? {});
  const hasCritical = (key: string) =>
    metadata.some((item) => item[key] === false || item[key] === "critical");
  const hasPositive = (key: string) => metadata.every((item) => item[key] === true);
  const hasVerifiedSafetyEvidence = (key: string) =>
    metadata.length > 0 && metadata.every((item) => item[key] === true);
  const formatsValid =
    outputs.length > 0 &&
    outputs.every((output) =>
      Boolean(output.width && output.height && output.objectKey && output.contentHash),
    );
  const checks: Record<string, QualityCheck> = {
    "Product / identity truth": {
      dimension: "Product / identity truth",
      verdict: hasCritical("productTruth")
        ? "critical"
        : brief.mode === "lock" &&
            (!hasPositive("productTruth") ||
              !hasVerifiedSafetyEvidence("maskingChecked") ||
              !hasVerifiedSafetyEvidence("integrityChecked"))
          ? "warn"
          : "pass",
      repair:
        brief.mode === "lock" &&
        (!hasPositive("productTruth") ||
          !hasVerifiedSafetyEvidence("maskingChecked") ||
          !hasVerifiedSafetyEvidence("integrityChecked"))
          ? "Verify product region, source geometry, masking, and integrity evidence."
          : undefined,
    },
    "Brand rules & typography": {
      dimension: "Brand rules & typography",
      verdict: hasCritical("brandViolation")
        ? "critical"
        : hasPositive("brandChecked") && hasVerifiedSafetyEvidence("ocrChecked")
          ? "pass"
          : "warn",
      repair: hasCritical("brandViolation")
        ? "Repair the brand rule violation before approval."
        : undefined,
    },
    "Message / claim correctness": {
      dimension: "Message / claim correctness",
      verdict: hasCritical("claimViolation")
        ? "critical"
        : hasPositive("claimsChecked") && hasVerifiedSafetyEvidence("ocrChecked")
          ? "pass"
          : "warn",
      repair: hasCritical("claimViolation")
        ? "Remove or substantiate the unsupported claim."
        : undefined,
    },
    "Composition & platform fit": {
      dimension: "Composition & platform fit",
      verdict: formatsValid ? "pass" : "critical",
      repair: formatsValid
        ? undefined
        : "Render the requested ratio with valid dimensions and safe-area metadata.",
    },
    "Technical export / rights": {
      dimension: "Technical export / rights",
      verdict:
        formatsValid && outputs.every((output) => output.metadata?.rightsChecked !== false)
          ? "pass"
          : "critical",
      repair: formatsValid
        ? undefined
        : "Persist a retrievable object, content hash, and rights/provenance metadata.",
    },
  };
  return checks;
}
