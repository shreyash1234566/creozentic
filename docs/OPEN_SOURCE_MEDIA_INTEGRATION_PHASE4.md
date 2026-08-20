# Open-Source Media Integration: Phase 4 Completion

## Executive result

Creozentic now has an explicit, license-aware integration layer for the selected open-source editing candidates and a completed automatic B-roll media branch for uploaded-video editing.

The system remains source-first: the uploaded video is the main story and evidence. Open-source components contribute bounded worker patterns and references; Creozentic remains the system of record for EditPlans, evidence, approvals, assets, provenance, timelines, rendering, and QA.

## Cloned repositories

| Repository | Local path | License/reference | Role in Creozentic |
|---|---|---|---|
| OpenShorts | `third_party/openshorts` | MIT core; managed components require separate review | Moment detection, captions, face-aware reframing, FFmpeg, still-B-roll patterns |
| CutScript | `third_party/cutscript` | MIT | Transcript editing, word-level timing, filler removal, audio-cleanup patterns |
| IMG.LY VideoClipper | `third_party/videoclipper` | Repository/SDK terms require review | Browser composition, speaker layouts, captions, timeline UX reference |
| AI-Broll | `third_party/ai-broll` | MIT; MuAPI dependency | B-roll prompt and asset-generation proof of concept |
| FunClip | `third_party/funclip` | Open-source; model/provider terms require review | ASR, timestamps, speaker clipping, SRT reference |

These repositories are cloned locally under `third_party/`. They are not blindly imported into the Next.js process and their unreviewed cloud components are not executed automatically.

## Bounded adapter plan

`src/server/open-source-editing.ts` now records the exact role of each cloned reference and returns the strategy used by the EditPlan/render manifest:

```text
transcript            → CutScript reference
ASR fallback          → FunClip reference
moment detection      → OpenShorts reference
reframing             → OpenShorts reference
still B-roll          → OpenShorts reference
moving B-roll         → Creozentic VideoGateway
composition           → VideoClipper reference
approval/provenance   → Creozentic
renderer              → Creozentic FFmpeg/Remotion
```

The plan is persisted in the render manifest so the selected open-source roles are reproducible and inspectable.

## Completed B-roll execution

The B-roll decision policy in `src/server/broll-decision.ts` classifies each visual gap as:

```text
NONE
STILL_IMAGE
GENERATED_VIDEO
```

It considers timing, factuality, precise text/data, motion requirement, and budget mode. The execution path now dispatches the selected type through the creative gateway:

```text
STILL_IMAGE      → image.generate
GENERATED_VIDEO  → video.generate
```

Returned assets are checked for workspace-scoped object keys, content hashes, storage provenance, and compatible MIME type before being persisted as generated Assets. The associated VisualInsert remains pending until approval.

## Rendering and timeline changes

The timeline builder now creates separate tracks:

```text
main-video
captions
voice
music
images
  └─ generated-stills
video
  └─ generated-video-broll
```

The FFmpeg compositor accepts both `imagePath` and `videoPath` overlays. Approved generated stills are looped and composited over bounded intervals. Approved generated video clips are composited with `setpts=PTS-STARTPTS`, bounded overlay windows, source-audio preservation, and a final `-shortest` guard.

The render action materializes the verified uploaded source asset, loads approved generated image/video assets, renders the output, and persists the export Asset.

## Fallback and approval behavior

The planned decision fallback remains:

```text
Source is sufficient
  → no insert

Motion-dependent gap
  → generated video

Video fails or is rejected
  → generated still image

Still fails or is rejected
  → kinetic typography or no insert
```

All generated assets must be approved before rendering. The existing visual approval UI was extended without replacing the existing design system or navigation.

## Verification

| Check | Result |
|---|---:|
| TypeScript validation | Passed |
| Existing unit/contract suite | 30 passed, 0 failed |
| B-roll decision tests | 4 passed, 0 failed |
| Timeline and renderer tests | 4 passed, 0 failed |
| Guide completeness | 13 passed, 0 failed |
| OSS completeness | 12 core + 6 supporting boundaries passed |
| AI-video provider separation | Preserved through `VideoGateway` |

The normal local test suite does not install third-party Python model weights or call paid provider endpoints. Those remain external activation requirements. The code path, provider capability, asset validation, approval gate, timeline representation, and renderer branch are now present.

## What is adapted versus written by Creozentic

The open-source projects were not translated line by line into TypeScript. Their useful ideas and bounded worker roles are recorded and isolated. Creozentic’s product-specific parts remain custom:

```text
multi-tenant asset/provenance model
EditPlan and evidence contracts
B-roll media decision policy
approval lifecycle
provider routing
fallback hierarchy
OTIO-style timeline contract
FFmpeg/Remotion render boundary
QA and export persistence
```

This avoids copying entire applications, importing incompatible UI architectures, or silently executing unreviewed third-party cloud code.
