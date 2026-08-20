export type BrollMediaType = "NONE" | "STILL_IMAGE" | "GENERATED_VIDEO";

export type BrollDecisionInput = {
  gapSec: number;
  factuality: "VERIFIED" | "NON_FACTUAL_METAPHOR" | "GENERATED_UNVERIFIED";
  requiresMotion: boolean;
  containsPreciseTextOrData?: boolean;
  budgetMode?: "FREE" | "BALANCED" | "PREMIUM";
};

export type BrollDecision = {
  mediaType: BrollMediaType;
  reason: string;
  fallback: "NONE" | "STILL_IMAGE" | "KINETIC_TEXT";
  estimatedRisk: "LOW" | "MEDIUM" | "HIGH";
};

/**
 * Selects the safest useful B-roll medium. This is deliberately pure so the
 * EditPlan can be tested before any paid generation call is made.
 */
export function decideBrollMedia(input: BrollDecisionInput): BrollDecision {
  const gapSec = Number.isFinite(input.gapSec) ? input.gapSec : 0;
  const budgetMode = input.budgetMode ?? "BALANCED";

  if (gapSec < 1.2) {
    return {
      mediaType: "NONE",
      reason: "The visual gap is too short to justify an inserted asset.",
      fallback: "KINETIC_TEXT",
      estimatedRisk: "LOW",
    };
  }

  if (input.containsPreciseTextOrData || input.factuality === "VERIFIED") {
    return {
      mediaType: "STILL_IMAGE",
      reason: "Factual or text-heavy content is safer as a controlled still insert.",
      fallback: "KINETIC_TEXT",
      estimatedRisk: "LOW",
    };
  }

  if (input.requiresMotion && gapSec >= 2.5 && budgetMode !== "FREE") {
    return {
      mediaType: "GENERATED_VIDEO",
      reason: "The beat requires visible motion and has enough duration for a usable clip.",
      fallback: "STILL_IMAGE",
      estimatedRisk: "MEDIUM",
    };
  }

  return {
    mediaType: "STILL_IMAGE",
    reason: budgetMode === "FREE"
      ? "Free mode avoids moving-video generation and uses a controllable still insert."
      : "A still insert provides the best quality-to-risk tradeoff for this beat.",
    fallback: "KINETIC_TEXT",
    estimatedRisk: "LOW",
  };
}
