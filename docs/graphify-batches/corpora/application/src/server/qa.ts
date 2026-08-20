import type { QualityCheck, ProductLockBrief } from "../domain";

type CreativeOutput = {
  width?: number;
  height?: number;
  objectKey?: string;
  contentHash?: string;
  metadata?: Record<string, unknown>;
  format?: string;
};

type Evidence = { status?: unknown; version?: unknown; provider?: unknown; scanner?: unknown };

function positiveEvidence(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const evidence = value as Evidence;
  return (
    evidence.status === "PASSED" &&
    typeof evidence.version === "string" &&
    Boolean(evidence.provider ?? evidence.scanner)
  );
}

export function evaluateCreativeOutputs(
  brief: ProductLockBrief,
  outputs: CreativeOutput[],
): Record<string, QualityCheck> {
  const metadata = outputs.map((output) => output.metadata ?? {});
  const hasCritical = (key: string) =>
    metadata.some((item) => item[key] === false || item[key] === "critical");
  const allEvidence = (...keys: string[]) =>
    metadata.length > 0 &&
    metadata.every((item) => keys.every((key) => positiveEvidence(item, key)));
  const formatsValid =
    outputs.length > 0 &&
    outputs.every((output) =>
      Boolean(output.width && output.height && output.objectKey && output.contentHash),
    );
  const lock = brief.mode === "lock";
  const productEvidenceComplete = allEvidence(
    "productIdentityEvidence",
    "maskingEvidence",
    "integrityEvidence",
  );
  const brandEvidenceComplete = allEvidence("brandEvidence", "ocrEvidence", "typographyEvidence");
  const claimEvidenceComplete = allEvidence("claimEvidence", "ocrEvidence");
  const rightsEvidenceComplete = allEvidence("rightsEvidence", "safeAreaEvidence");
  const absentEvidenceVerdict = (complete: boolean) =>
    complete ? "pass" : lock ? "critical" : "warn";

  return {
    "Product / identity truth": {
      dimension: "Product / identity truth",
      verdict: hasCritical("productTruth")
        ? "critical"
        : absentEvidenceVerdict(productEvidenceComplete),
      repair: productEvidenceComplete
        ? undefined
        : "Attach positive, versioned product identity, segmentation, and integrity evidence before approval.",
    },
    "Brand rules & typography": {
      dimension: "Brand rules & typography",
      verdict: hasCritical("brandViolation")
        ? "critical"
        : absentEvidenceVerdict(brandEvidenceComplete),
      repair: brandEvidenceComplete
        ? undefined
        : "Attach positive, versioned brand, OCR, and typography evidence before approval.",
    },
    "Message / claim correctness": {
      dimension: "Message / claim correctness",
      verdict: hasCritical("claimViolation")
        ? "critical"
        : absentEvidenceVerdict(claimEvidenceComplete),
      repair: claimEvidenceComplete
        ? undefined
        : "Attach positive, versioned claim and OCR evidence before approval.",
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
        !formatsValid || metadata.some((output) => output.rightsChecked === false)
          ? "critical"
          : absentEvidenceVerdict(rightsEvidenceComplete),
      repair:
        formatsValid && rightsEvidenceComplete
          ? undefined
          : "Attach retrievable output, content hash, and positive rights/provenance and safe-area evidence.",
    },
  };
}
