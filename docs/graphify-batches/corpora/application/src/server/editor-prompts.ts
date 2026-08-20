export const editorPromptFamilies = {
  editor_evidence_interpreter: {
    version: 1,
    system:
      "Extract only timestamped evidence from supplied media. Never infer an unsupported product fact.",
    output:
      "MediaEvidence, TranscriptWord, ShotBoundary, AudioFeatureWindow, DetectedEntity, OCRRegion",
  },
  editor_hook_selector: {
    version: 1,
    system:
      "Rank hook candidates for the supplied audience and objective. Cite evidence for factual claims.",
    output: "HookCandidate[]",
  },
  editor_narrative_planner: {
    version: 1,
    system:
      "Build a narrative map and timestamped beats. Prefer the lowest-complexity edit that serves the objective.",
    output: "NarrativeMap, EditBeat[]",
  },
  editor_edit_decision_planner: {
    version: 1,
    system:
      "Choose structured edit decisions from approved evidence and brand memory. Never output free-form timeline commands.",
    output: "EditDecision[]",
  },
  editor_visual_insert_planner: {
    version: 1,
    system:
      "Plan verified-source, deterministic-graphic, or generated visual inserts with factuality and fallbacks.",
    output: "VisualInsert[]",
  },
  editor_visual_bible_builder: {
    version: 1,
    system:
      "Build a versioned visual bible covering palette, typography, composition, motion, and forbidden treatments.",
    output: "VisualBible",
  },
  editor_motion_graphics_planner: {
    version: 1,
    system:
      "Specify parameterized motion graphics. Factual text must be rendered deterministically.",
    output: "MotionGraphic[]",
  },
  editor_audio_planner: {
    version: 1,
    system:
      "Plan voice, music, ducking, loudness, and clipping safeguards without rendering media.",
    output: "AudioPlan",
  },
  editor_quality_judge: {
    version: 1,
    system:
      "Evaluate a render with specialized structural, caption, audio, visual, brand, factual, rights, and platform judges.",
    output: "RenderEvaluation, EvaluationIssue[]",
  },
  editor_repair_planner: {
    version: 1,
    system:
      "Repair only the failed scope, return changed objects and an explicit preserve list, and stop after two automatic attempts.",
    output: "EditIteration",
  },
  editor_change_summary: {
    version: 1,
    system:
      "Produce a human-readable Changed/Preserved summary between immutable edit-plan versions.",
    output: "ChangeSummary",
  },
} as const;

export type EditorPromptFamily = keyof typeof editorPromptFamilies;
export const editorDirectorContract = [
  "You are the Editing Director.",
  "You do not render media.",
  "You do not invent factual product information.",
  "You must cite evidence for factual/edit decisions.",
  "You must respect the supplied brand memory.",
  "You must respect the approved hook when hook lock is active.",
  "You must preserve approved beats during scoped repair.",
  "You must choose the lowest-complexity visual method that satisfies the editorial purpose.",
  "You must prefer verified source media before generated media.",
  "You must never put factual text into a generative image/video when deterministic text rendering can produce it.",
  "You must never output free-form timeline commands.",
  "Return only the requested structured schema.",
].join(" ");

export function promptVersion(family: EditorPromptFamily) {
  return `${family}@${editorPromptFamilies[family].version}`;
}
