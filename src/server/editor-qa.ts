import { editorIssueCodes, type EditorState } from "./editor-contracts";

export type JudgeIssue = {
  issueCode: (typeof editorIssueCodes)[number];
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  beatId?: string;
  sourceEvidenceIds: string[];
  confidence: number;
  explanation: string;
  proposedFix: string;
};

export type JudgeInput = {
  hasHook: boolean;
  hasVerifiedEvidence: boolean;
  hasCaptionPlan: boolean;
  captionsInsideSafeZone: boolean | null;
  audioClipping: boolean | null;
  transcriptMatches: boolean | null;
  rightsApproved: boolean;
  platformValid: boolean;
  brandAligned: boolean;
  motionIntensity: "WEAK" | "BALANCED" | "AGGRESSIVE";
  repeatedVisualCount: number;
};

function issue(
  issueCode: JudgeIssue["issueCode"],
  severity: JudgeIssue["severity"],
  explanation: string,
  proposedFix: string,
): JudgeIssue {
  return { issueCode, severity, sourceEvidenceIds: [], confidence: 0.95, explanation, proposedFix };
}

export function runSpecializedJudges(input: JudgeInput) {
  const issues: JudgeIssue[] = [];
  if (!input.hasHook)
    issues.push(
      issue(
        "HOOK_WEAK",
        "HIGH",
        "No approved hook is present.",
        "Select and lock an evidence-backed hook.",
      ),
    );
  if (!input.hasVerifiedEvidence)
    issues.push(
      issue(
        "PRODUCT_FACT_RISK",
        "CRITICAL",
        "The edit has no verified source evidence.",
        "Attach verified product media before rendering factual claims.",
      ),
    );
  if (!input.hasCaptionPlan)
    issues.push(
      issue(
        "CAPTION_COLLISION",
        "HIGH",
        "No caption plan is attached.",
        "Create a caption plan with platform safe zones.",
      ),
    );
  if (input.captionsInsideSafeZone === null)
    issues.push(issue("QA_NOT_VERIFIED", "HIGH", "Caption geometry was not measured from the rendered output.", "Run the rendered-caption geometry probe before approving."));
  else if (!input.captionsInsideSafeZone)
    issues.push(
      issue(
        "CAPTION_OUT_OF_SAFE_ZONE",
        "HIGH",
        "Caption placement exceeds the platform safe zone.",
        "Move captions inside the approved safe area.",
      ),
    );
  if (input.audioClipping === null)
    issues.push(issue("QA_NOT_VERIFIED", "HIGH", "Audio peak/loudness was not measured from the rendered output.", "Run the audio probe before approving."));
  else if (input.audioClipping)
    issues.push(
      issue(
        "AUDIO_CLIPPING",
        "HIGH",
        "Audio clipping was detected.",
        "Lower peak gain and rerun the audio judge.",
      ),
    );
  if (input.transcriptMatches === null)
    issues.push(issue("QA_NOT_VERIFIED", "HIGH", "Transcript-to-render alignment was not measured.", "Run the transcript alignment probe before approving."));
  else if (!input.transcriptMatches)
    issues.push(
      issue(
        "TRANSCRIPT_MISMATCH",
        "HIGH",
        "Spoken transcript and edit plan do not match.",
        "Repair only the affected beat transcript.",
      ),
    );
  if (!input.rightsApproved)
    issues.push(
      issue(
        "RIGHTS_ERROR",
        "CRITICAL",
        "Rights approval is missing.",
        "Attach rights evidence or remove the asset.",
      ),
    );
  if (!input.platformValid)
    issues.push(
      issue(
        "PLATFORM_SPEC_ERROR",
        "HIGH",
        "Output does not satisfy platform specifications.",
        "Regenerate the platform adaptation plan.",
      ),
    );
  if (!input.brandAligned)
    issues.push(
      issue(
        "BRAND_STYLE_MISMATCH",
        "MEDIUM",
        "The render does not match the approved brand memory.",
        "Apply the current visual bible.",
      ),
    );
  if (input.motionIntensity === "AGGRESSIVE")
    issues.push(
      issue(
        "MOTION_TOO_AGGRESSIVE",
        "MEDIUM",
        "Motion exceeds the approved intensity.",
        "Use a lower-complexity motion recipe.",
      ),
    );
  if (input.motionIntensity === "WEAK")
    issues.push(
      issue(
        "MOTION_TOO_WEAK",
        "LOW",
        "Motion does not support the editorial purpose.",
        "Increase motion only on the affected visual insert.",
      ),
    );
  if (input.repeatedVisualCount > 1)
    issues.push(
      issue(
        "REPETITIVE_VISUAL",
        "MEDIUM",
        "The same visual treatment repeats too often.",
        "Replace one repeated insert with verified alternate media.",
      ),
    );
  const critical = issues.some((item) => item.severity === "CRITICAL");
  const high = issues.some((item) => item.severity === "HIGH");
  const verdict = critical ? "REJECT" : high || issues.length ? "REVIEW" : "PASS";
  return {
    verdict,
    score: Math.max(0, 1 - issues.length * 0.08),
    issues,
    judges: ["structural", "caption", "audio", "visual", "brand", "factual", "rights", "platform"],
  };
}

export function canAutopublish(state: EditorState, verdict: string, allowReview: boolean) {
  return state === "APPROVED" && (verdict === "PASS" || (verdict === "REVIEW" && allowReview));
}
