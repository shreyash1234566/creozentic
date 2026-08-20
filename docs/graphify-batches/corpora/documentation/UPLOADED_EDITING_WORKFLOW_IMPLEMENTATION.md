# Uploaded-Video Editing Workflow Implementation Report

## Executive result

The missing implementation identified in the uploaded-video audit has now been added. Creozentic’s uploaded-video editor can now plan generated still-image inserts, generate them through the existing creative-provider boundary, persist them as verified workspace assets, require approval, represent approved inserts as an image track in the OTIO-style timeline, composite them over the uploaded video with FFmpeg, and persist the rendered export.

The moving AI-video-generation path remains separate behind `VideoGateway.generate()` and is not invoked by ordinary uploaded-video editing.

## Completed workflow

```text
User uploads and verifies one source video
  ↓
FFmpeg / ffprobe and transcript/evidence analysis
  ↓
Director creates EditPlan
  ↓
EditPlan creates visual-insert prompts
  ↓
Editor calls image.generate through the creative provider router
  ↓
Provider output is verified and persisted as a GENERATED Asset
  ↓
VisualInsert.assetSource is linked to the generated Asset
  ↓
User approves each generated insert
  ↓
OTIO-style timeline includes an approved generated-stills image track
  ↓
FFmpeg composites approved stills at bounded start/end intervals
  ↓
Rendered MP4 is persisted as an EXPORT Asset
  ↓
QA and approval continue through the existing editor lifecycle
```

## Source changes

| File | Change |
|---|---|
| `src/server/editor.ts` | Added `generateEditorVisualInserts`, provider execution, workspace-key validation, object verification, generated-asset upsert, provenance metadata, approval enforcement, source-asset materialization, generated-still compositing input, and persisted export output. |
| `app/api/editor/projects/[projectId]/[...segments]/route.ts` | Added `POST /api/editor/projects/{projectId}/visuals/generate`. |
| `src/client/api.ts` | Added the typed `generateEditorVisualInserts` client function. |
| `src/views/Editor.tsx` | Extended the existing B-roll & Graphics workspace with generated-insert status, generation, and approval controls. The existing visual design and tab structure were preserved. The render button now uses the verified source asset. |
| `src/server/part2-runtime.ts` | Added a `generated-stills` image track to the OTIO-style timeline for approved inserts with bounded timing. |
| `src/server/editor-render.ts` | Added FFmpeg image inputs, bounded overlay filters, and approved-still compositing over the uploaded source video. |
| `tests/part2-runtime.test.ts` | Added a test proving approved inserts become bounded OTIO image clips while pending inserts are excluded. |

## Provider behavior

The new editor action uses the existing `executeCreativeRequest` abstraction with capability `image.generate`. It supports the configured production image provider and the development-only local deterministic image provider when that provider is explicitly enabled.

The provider output must include a workspace-scoped object key, content hash, MIME type, and storage-readable output. The generated Asset stores provider, model, model version, prompt, project ID, plan version, and visual-insert ID in metadata for reproducibility.

No ChatGPT Web, Antigravity, Codex, or other consumer session token is automatically converted into a general API key by this change. Those credentials remain external provider configuration concerns and must be activated only through a documented, authorized provider adapter.

## Approval and safety behavior

Generated inserts remain `PENDING` after generation. The UI exposes an **Approve insert** action. The editor render action rejects the render with `VISUAL_APPROVAL_REQUIRED` if a generated insert has an asset but is not approved.

The renderer only loads assets belonging to the current workspace and only accepts assets in `READY`, `IMMUTABLE`, or `DERIVED` status. Generated stills are loaded from storage into a temporary working directory, composited, and removed from the temporary directory after rendering.

## Timeline behavior

The existing main video track remains unchanged. Approved generated stills are represented in a separate track:

```text
tracks:
  - main: source video KEEP clips
  - generated-stills: approved image clips with asset ID, timeline start, duration, and motion metadata
```

Timing is stored inside the existing `motionRecipe` JSON contract as `startSec` and `endSec`, avoiding a database migration while remaining deterministic and versionable.

## Verification

| Check | Result |
|---|---:|
| TypeScript `tsc --noEmit` | Passed |
| Full direct test suite | **30 passed, 0 failed** |
| Guide completeness | **13 passed, 0 failed** |
| OSS completeness | **12 core boundaries + 6 supporting boundaries passed** |
| Added OTIO generated-stills test | Passed |
| Production smoke wrapper | Not run successfully because no server was listening on `127.0.0.1:3000`; this is an environment/runtime-start issue, not a TypeScript or unit-test failure. |

## Remaining external activation

The code path is implemented, but a real high-quality image result still requires one of the following:

| Activation | Required for |
|---|---|
| Configured image provider endpoint and API key | Production-quality generated stills |
| Explicitly enabled local creative provider and local storage | Free deterministic development test |
| Verified database connection and current Prisma deployment | Persisting data in the external database |
| Valid storage configuration | Provider-generated object retrieval and export persistence |

The first local test can use the deterministic provider if `LOCAL_CREATIVE_PROVIDER_ENABLED=true` and local storage/database prerequisites are available. That provider is a wiring test and intentionally does not represent premium image quality.

## Final status

```text
Separate uploaded-video editing path: implemented
Separate moving AI-video-generation path: preserved
Generated still-image stage: implemented
Generated asset persistence: implemented
Visual-insert approval: implemented
Generated-stills timeline track: implemented
FFmpeg still compositing: implemented
Rendered export persistence: implemented
Frontend controls: implemented without redesigning the UI
Unit/contract verification: 30 tests passing
```

The earlier `docs/UPLOADED_EDITING_WORKFLOW_AUDIT.md` described the state before these corrections. This report describes the corrected implementation.

Author: Manus AI
Date: 2026-08-19
