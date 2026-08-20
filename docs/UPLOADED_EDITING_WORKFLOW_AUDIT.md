# Uploaded-Video Editing Workflow Audit

## Verdict

The repository has a **separate uploaded-video/UGC path and a separate AI-video provider boundary**, but the intended workflow is **not yet implemented exactly as specified**.

The current code supports:

- uploading and verifying a source video;
- FFmpeg/ffprobe inspection;
- transcript/evidence analysis;
- hook/story/shot planning;
- an evidence-first EditPlan concept;
- deterministic video merge, captions, audio mixing, and QA boundaries;
- a separate provider boundary for AI-video generation;
- B-roll asset IDs in the UGC render contract.

The current code does **not** yet execute this intended stage inside uploaded-video editing:

```text
Director creates visual-insert prompts
  ↓
Image-generation provider creates still images
  ↓
Generated stills are inserted into the uploaded-video timeline
```

The schema contains `VisualInsert` records with prompts and source strategies, but the actual editor renderer does not consume those records, and the UGC renderer currently accepts only verified uploaded video assets as B-roll.

## Evidence of separation

### Uploaded-video/UGC path

`src/server/production-services.ts` implements `createUGCProject`, `analyzeUGCProject`, `planUGCShots`, and `renderUGCProject`.

The code requires verified source assets, analyzes the source, marks the pipeline `realFootageFirst: true`, plans HOOK/PROOF/CTA/B_ROLL shots, and renders with `video.merge`, `captions.render`, and optional `audio.mix`.

Relevant evidence:

- `createUGCProject` requires `sourceAssetIds` and verified assets.
- `analyzeUGCProject` stores `realFootageFirst: true`.
- `planUGCShots` creates shot kinds including `B_ROLL`.
- `renderUGCProject` builds an edit plan with `sourceAssetIds`, `shots`, `bRollAssetIds`, `captions`, and output durations.

### Separate AI-video boundary

`src/server/provider-adapters.ts` defines a separate `VideoGateway.generate` method that posts to `v1/video/generate`.

This is a separate provider boundary. The uploaded-video UGC render path does not call this `VideoGateway.generate` method.

## What current B-roll means

In the current UGC implementation, B-roll means **existing verified video assets supplied through `bRollAssetIds`**.

`renderUGCProject` validates each B-roll ID with:

```text
status in IMMUTABLE, READY, DERIVED
mimeType starts with video/
```

It rejects missing or non-video B-roll assets with `UGC_BROLL_NOT_READY`.

Therefore, the current implementation does not treat a generated still image as B-roll inside this UGC render method.

## Evidence of intended visual inserts in the schema-based editor

`prisma/schema.prisma` defines `VisualInsert` with:

- `sourceStrategy`;
- `assetSource`;
- `prompt`;
- `motionRecipe`;
- `factuality`;
- `approvalState`;
- `fallback`.

`src/server/editor.ts` creates two planned visual inserts:

1. a verified-source-first insert;
2. a `rights-cleared-then-generated-metaphor` insert with a prompt.

This proves that the **domain model and planning intent** include generated visual inserts.

However, the same service creates those rows with a prompt but does not call an image-generation provider to produce an image asset from that prompt.

## Evidence that the visual inserts are not yet rendered

`src/server/editor-render.ts` only accepts:

```text
sourcePath
outputPath
durationSec
width
height
```

It invokes FFmpeg on the source video, scales/pads it, optionally limits duration, and writes the output. It does not accept `VisualInsert` records, generated image asset IDs, B-roll placement decisions, captions, music, or motion graphics.

`src/server/part2-runtime.ts` builds an OTIO-style timeline containing only a single main video track made from `KEEP` decisions. It does not materialize visual inserts, B-roll clips, generated images, or motion-graphic layers.

## Evidence from the media-job boundary

`src/server/media-jobs.ts` allows:

```text
composition.render
video.merge
captions.render
audio.mix
audio.generate
upscale
video.lipsync
```

There is no prompt-based `image.generate` job in this media-job boundary.

`composition.render` requires an already verified image asset. It does not create one from a prompt.

`src/server/local-renderer.ts` processes existing image, video, and audio assets. Its video path performs deterministic FFmpeg merge/caption/upscale operations. It does not generate images from prompts, interpret `VisualInsert` rows, or place generated stills according to an EditPlan.

## Frontend evidence

`src/views/VideoStudio.tsx` does have:

- uploaded source-video discovery;
- server UGC project creation;
- source analysis;
- shot planning;
- `bRollAssetIds` state;
- music asset state;
- UGC rendering;
- captions, cover shot, consent, and review state.

The frontend passes `bRollAssetIds` to `renderServerUGCProject`, which confirms that the current UI expects B-roll asset IDs. The backend currently expects those IDs to refer to verified video assets.

## Actual workflow today

```text
Upload verified source video
  ↓
Analyze transcript/scenes/speakers/faces when available
  ↓
Create UGC project
  ↓
Plan source-footage shots
  ↓
Optionally provide existing verified video B-roll IDs
  ↓
Merge source/B-roll videos
  ↓
Optional consent-gated lip-sync
  ↓
Render captions
  ↓
Optional audio mixing with supplied music/voice assets
  ↓
QA/review artifacts
  ↓
Export
```

## Intended workflow requested by the user

```text
Upload only the main source video
  ↓
Inspect and transcribe it
  ↓
Director creates EditPlan
  ↓
Director creates visual-insert prompts
  ↓
Image-generation model creates still visual inserts
  ↓
User approves plan and generated stills
  ↓
FFmpeg/Remotion inserts the stills into the source-video timeline
  ↓
Captions + overlays + audio mix + music + optional narration
  ↓
Variants
  ↓
QA and export
```

## Certainty matrix

| Requirement | Repository status | Certainty | Evidence |
|---|---|---:|---|
| Uploaded source video is supported | Implemented | High | `production-services.ts` source asset validation and UGC project creation |
| Uploaded editing is separate from AI-video generation | Implemented at provider boundary | High | UGC render path uses media jobs; `VideoGateway.generate` is a separate adapter |
| Source-first editing concept | Implemented | High | `realFootageFirst: true` and source asset checks |
| Transcript/evidence analysis | Implemented with partial provider dependence | High | `editor-evidence.ts`, UGC analysis |
| Hook/story/shot planning | Implemented | High | UGC shot planner and editor plan service |
| B-roll concept in planning | Implemented | High | `B_ROLL` shots, `bRollAssetIds`, `broll-planning` skill |
| B-roll from existing uploaded video files | Implemented in UGC render | High | `bRollAssetIds` validates verified video assets |
| B-roll from generated still images | Not implemented in current render path | High | No image-generation call; UGC B-roll requires video MIME type |
| Director-generated still-image prompts | Present in schema/editor plan | High | `VisualInsert.prompt` and generated metaphor prompt |
| Image generation from those prompts | Not implemented in editor path | High | No `image.generate` editor job or provider call |
| Generated stills inserted into editor timeline | Not implemented in current renderer | High | Renderer only accepts sourcePath/outputPath; OTIO has only main video track |
| Captions and deterministic rendering | Implemented in boundaries; local renderer is basic | High | `captions.render`, FFmpeg renderer |
| Audio mixing | Implemented as a media-job boundary | High | `audio.mix` in UGC render path |
| QA/review state | Implemented as contract/runtime boundaries | High | review artifacts, specialized judges, evaluation schema |
| Full intended workflow exactly as requested | Not yet complete | High | Generated still-image stage is missing from execution |

## Test status

The editor contract tests passed:

```text
29 tests passed
0 tests failed
```

The command wrapper then attempted a production smoke check against `127.0.0.1:3000`, but no server was running, so that smoke step failed with `ECONNREFUSED`. The passing unit/contract tests verify contracts and deterministic logic; they do not prove that a real image-generation provider is connected or that generated stills are inserted into a rendered video.

## Required correction for exact intended behavior

To make the system match the requested workflow, the following local-code work is required:

1. Add an editor-specific generated-visual stage that consumes `VisualInsert.prompt` and creates image assets through the configured image provider or local FLUX route.
2. Persist generated image asset IDs and provenance on each `VisualInsert`.
3. Add a visual-asset approval gate before rendering.
4. Extend the EditPlan/EDL/OTIO timeline model with an image-insert clip/layer containing start time, end time, asset ID, motion recipe, crop, safe zone, and beat ID.
5. Extend the renderer contract to consume the timeline and composite still-image inserts over the uploaded source video.
6. Keep generated moving video behind the separate `VideoGateway.generate` boundary and do not invoke it during ordinary uploaded-video editing.
7. Add an integration test that uploads one source video, generates at least one still insert, renders it into the timeline, and asserts the output manifest contains the generated asset and visual-insert clip.

## Final verdict

The repository **does separate uploaded-video editing from AI-video generation**, and it has the correct high-level concepts for source-first editing, B-roll planning, visual inserts, deterministic rendering, and QA.

It is **not yet 100% identical to the workflow you intended** because the current execution path does not generate still-image inserts from prompts or composite them into the uploaded-video timeline. Current B-roll is existing verified video assets passed by ID. The visual-insert schema is ahead of the actual renderer.

Author: Manus AI
Date: 2026-08-19
