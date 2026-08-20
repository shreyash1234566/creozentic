# Open-Source Uploaded-Video AI Editing Research

## Scope

This research evaluates open-source projects and n8n workflows for Creozentic’s uploaded-video editing path only. The target input is one main uploaded video. The target output is an AI-assisted edit containing source cuts, captions, generated still-image inserts, optional generated moving B-roll, audio treatment, deterministic rendering, QA, and approval. Social publishing, audience feedback loops, and Instagram automation are excluded.

## Required capability matrix

| Required capability | Why Creozentic needs it |
|---|---|
| Uploaded source video ingestion | The original video remains the primary evidence and story source. |
| Media inspection | Duration, codecs, scenes, audio, resolution, and file health must be known before planning. |
| Word-level transcription | Enables caption timing and transcript-aligned cuts. |
| Speaker/scene understanding | Improves selection of moments and multi-speaker edits. |
| Director/EditPlan | Converts transcript and evidence into hook, beats, cuts, captions, and visual requests. |
| B-roll decision | Chooses no insert, generated still, or generated moving clip for each gap. |
| Still-image generation | Supplies controlled visual inserts when the source lacks visual support. |
| Moving-video generation | Supplies motion-rich B-roll only when motion is genuinely useful. |
| Approval/provenance | Prevents unreviewed or unverified generated media from reaching the render. |
| Deterministic timeline/rendering | Applies cuts, images, captions, audio, and variants reproducibly. |
| QA and fallback | Detects failures and falls back from video to still to text/no insert. |

## Ranked candidates

| Rank | Candidate | Strongest capability | What it actually provides | Main gap for Creozentic | Recommendation |
|---:|---|---|---|---|---|
| 1 | OpenShorts | End-to-end short-form clipping patterns | Uploaded long video, moment detection, faster-whisper, captions, face tracking, smart reframing, FFmpeg, and generated still B-roll with Ken Burns-style motion | Does not prove Creozentic’s evidence/provenance/approval model or automatic still-versus-video selection; cloud directory has separate licensing | Use as the strongest reference and selectively adapt MIT-core patterns, not replace Creozentic |
| 2 | CutScript | Transcript-driven editing | WhisperX word-level transcription, transcript deletion cuts, undo/redo, AI filler removal, clip creation, captions, audio cleanup, FFmpeg export, diarization | No generated B-roll branch, no EditPlan visual approval, no moving B-roll | Adapt transcript/editing ideas or isolate as a worker reference |
| 3 | IMG.LY VideoClipper | Browser composition and short-clip UX | Long-to-short workflow, captions, speaker boundaries, sentence detection, multi-speaker layouts, timeline/composition patterns | Dependency and SDK licensing must be checked; no verified generated B-roll decision/generation pipeline | Use as a UI/composition reference only; do not copy blindly |
| 4 | FunClip | Local ASR and transcript clipping | FunASR/Paraformer, timestamps, hotwords, speaker recognition, LLM-assisted clipping, SRT, local Gradio service | No still/video B-roll generation, no evidence-aware EditPlan, no approval/compositing system | Consider as an optional ASR/clipping worker, especially for multilingual/Chinese audio |
| 5 | AI-Broll | Small B-roll proof of concept | Example uploaded video transformed with AI B-roll; MIT license; links to MuAPI image/video APIs | Notebook-scale, third-party dependency, no production pipeline, no approval, no robust timeline contract | Use only as a prompt/B-roll experiment; do not adopt as core |
| 6 | n8n prompt-to-video workflow | Low-code orchestration pattern | Prompt → script → TTS → Pexels B-roll → SRT → FFmpeg/manual assembly | Does not ingest/analyze an uploaded source video and does not implement evidence-aware B-roll selection | Use only as a prototype orchestration reference |

## Proof that no single candidate is a complete replacement

OpenShorts is the closest candidate because its repository describes long-video input, captions, smart reframing, FFmpeg rendering, and generated still B-roll. However, its documented B-roll path is still-image generation plus motion effects, not a verified autonomous decision between still and moving B-roll. Its hosted/cloud components also carry separate commercial licensing terms.

CutScript and FunClip solve the transcript-to-clip problem well, but neither provides the required generated visual asset lifecycle. AI-Broll demonstrates generated B-roll but is only a small notebook and delegates generation to MuAPI. The n8n template creates videos from a text topic and stock footage; it is not an uploaded-video editor. Therefore, combining bounded components is more reliable than replacing Creozentic with one project.

## Recommended integration plan

### Phase A: retain Creozentic’s core

Keep the existing Creozentic EditPlan, evidence records, VisualInsert model, approval states, deterministic timeline, FFmpeg/Remotion renderer, asset checksums, and tenant/workspace boundaries. These controls are not supplied by the candidate projects at the required level.

### Phase B: adapt the strongest worker capabilities

Use OpenShorts as the primary reference for source-video clipping, captions, face-aware reframing, and generated still B-roll. Use CutScript patterns for transcript-driven editing, filler-word handling, undo/redo semantics, and audio cleanup. Use FunClip only if its ASR performance is better for the target languages or difficult audio.

Do not copy complete applications into the web process. Keep each integration behind a worker/provider adapter and return stable Creozentic asset and timeline contracts.

### Phase C: implement the B-roll decision gateway

The Director and deterministic policy should produce:

```text
NONE
STILL_IMAGE
GENERATED_VIDEO
```

For each visual gap, store the reason, risk, timing, prompt, factuality, provider/model, approval state, and fallback. The execution order should be:

```text
No insert if source footage is sufficient
  ↓ otherwise
Still image for factual, text-heavy, short, or low-motion gaps
  ↓ otherwise
Moving video for motion-dependent, long-enough, non-factual gaps
  ↓ if video fails or is rejected
Still image
  ↓ if still fails or is rejected
Kinetic typography or no insert
```

### Phase D: add moving-video execution

Connect the existing `VideoGateway` to the `GENERATED_VIDEO` decision branch. Persist the asynchronous job ID, poll or receive completion, create a verified video Asset, attach it to the VisualInsert or MotionInsert record, require approval, and add the approved clip to the timeline. The renderer must support both image overlays and video overlays without changing the source-first behavior.

### Phase E: test with controlled comparisons

Use the same uploaded source, same transcript, same EditPlan, and same time intervals. Compare three modes:

| Mode | Visual support |
|---|---|
| A | Source footage only plus captions |
| B | Source footage plus generated still inserts |
| C | Source footage plus policy-selected still or moving inserts |

Judge source fidelity, caption accuracy, pacing, visual relevance, temporal consistency, factual safety, render correctness, and cost. Do not compare different scripts or different source videos.

## License and operational cautions

OpenShorts core is described as MIT, but its cloud/managed infrastructure has separate commercial licensing. CutScript and AI-Broll are described as MIT. IMG.LY’s repository is tied to an SDK ecosystem whose dependency and automated-use terms require separate review. FunClip is open-source, but its model weights and external model/provider terms must be checked before commercial deployment. n8n workflow templates are configuration artifacts, not full production software licenses.

The safest integration rule is to copy only clearly licensed code, preserve attribution and license notices, isolate AGPL or source-available components, and avoid importing unknown hosted/cloud code into Creozentic’s production runtime.

## Final recommendation

There is no verified single open-source project that supplies every required feature at Creozentic’s level. **OpenShorts is the closest complete reference**, but Creozentic should remain the system of record. Adapt OpenShorts for clipping/reframing/still-B-roll patterns, CutScript for transcript editing, and FunClip only where its ASR is demonstrably better. Build the evidence-aware B-roll decision, provider routing, approval lifecycle, and moving-video fallback in Creozentic itself.

## References

[1]: https://github.com/mutonby/openshorts "OpenShorts repository"
[2]: https://github.com/DataAnts-AI/CutScript "CutScript repository"
[3]: https://github.com/imgly/videoclipper "IMG.LY VideoClipper repository"
[4]: https://github.com/modelscope/FunClip "FunClip repository"
[5]: https://github.com/Anil-matcha/AI-B-roll "AI-Broll repository"
[6]: https://n8n.io/workflows/10502-create-ai-videos-from-prompts-with-openai-script-tts-and-pexels-b-roll-assembly/ "n8n prompt-to-video workflow"
