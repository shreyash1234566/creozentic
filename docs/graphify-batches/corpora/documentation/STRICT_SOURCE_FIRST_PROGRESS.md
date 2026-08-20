# Strict source-first progress

The ownership map now assigns media algorithms to original workers and keeps Creozentic TypeScript responsible for UI, job management, contracts, approvals, provenance, routing, and coordination.

The capability map now records:

- CutScript as the primary transcript worker;
- FunClip as ASR fallback;
- OpenShorts as the moment/reframing worker;
- ComfyUI as still-image generation owner;
- ViMax as moving-video generation owner;
- OpenMontage as the selected composition owner;
- FFmpeg as the deterministic system renderer;
- Creozentic as manager/approval/provenance owner.

The previous custom gateway placeholder for moving B-roll was removed from the capability plan and replaced with the original ViMax worker. The previous generic Creozentic approval label was changed to `creozentic-manager`.

Validation after this ownership change:

```text
TypeScript: passed
Tests: 34 passed, 0 failed
```

Important: ownership mapping is complete, but runtime activation is still separate. OpenShorts has produced a verified output. The remaining original workers still need their original dependencies, models, services, or output-contract smoke tests before they can be marked active.


## New connection

The uploaded-video evidence path now delegates metadata, audio windows, and optional SceneDetect/OpenCV analysis to the existing `apps/worker/media_analysis.py` subprocess. TypeScript continues to normalize the returned evidence and persist it; it does not implement the media analysis itself. External speech transcription remains a fallback only when the worker returns no transcript.

Validation after this connection:

```text
TypeScript: passed
Tests: 34 passed, 0 failed
```

This connection does not falsely mark OCR, diarization, face detection, object tracking, segmentation, or generative models as active. Those capabilities still require their original worker dependencies/models and real smoke tests.
