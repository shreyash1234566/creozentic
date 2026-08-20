# Strict source-first ownership map

## Rule

Original repository code owns media algorithms. Creozentic TypeScript owns product coordination.

## Capability ownership

| Capability | Current custom boundary | Required original owner | Action |
|---|---|---|---|
| Upload, asset IDs, workspace scope | `src/server/editor.ts`, API routes | Creozentic | Keep |
| Media metadata and validation | `ffprobe` boundary | FFmpeg/ffprobe | Keep as external deterministic tool |
| Transcript | provider boundary | Original CutScript/FunClip/Faster-Whisper worker | Delegate; no custom transcript algorithm |
| Scene boundaries | `apps/worker/media_analysis.py` optional SceneDetect | OpenShorts/SceneDetect original worker | Delegate; keep only result normalizer |
| Face-safe reframing | Creozentic plan metadata | OpenShorts original worker | Delegate |
| Speaker diarization | provider boundary | FunClip/pyannote original worker | Delegate when activated |
| OCR | evidence contract | PaddleOCR/Tesseract original package | Delegate when activated |
| Semantic visual matching | B-roll policy inputs | CLIP/sentence-transformers original models | Delegate when activated |
| Object tracking/masking | timeline metadata | YOLO/SAM/OpenCV original models | Delegate when activated |
| Still-image generation | `image.generate` dispatch | ComfyUI/Diffusers original worker | Delegate |
| Moving-video generation | `video.generate` dispatch | ViMax/ComfyUI original worker | Delegate |
| B-roll choice policy | `broll-decision.ts` | Creozentic orchestration | Keep as policy/manager, using original evidence |
| Timeline state, approvals, provenance | Creozentic database/contracts | Creozentic | Keep |
| Timeline media algorithm | `part2-runtime.ts`/renderer | Selected original composition worker | Replace with original worker output where available |
| Final deterministic export | FFmpeg | FFmpeg | Keep as deterministic tool |
| QA records and approval | Creozentic | Creozentic | Keep |

## Required runtime shape

```text
Creozentic manager
  ↓ starts original worker
Original worker performs media algorithm
  ↓ returns transcript/evidence/asset/timeline/output
Creozentic stores and validates result
  ↓ starts next original worker
Final FFmpeg/export boundary
```

## Current mismatch

Before this source-first refactor, the repository’s TypeScript path still built a custom timeline and directly composited generated media. That is acceptable for a prototype, but it is not the strict source-first ownership requested by the user. The refactor must make the original worker the owner of each media algorithm and leave TypeScript as the coordinator.
