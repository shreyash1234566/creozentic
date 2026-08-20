# Clean Vendored Repository Manifest

## Purpose

This document records the single-place checkout prepared for Creozentic. The `third_party/` folders contain the original worker source trees. Their media algorithms were not rewritten into TypeScript.

## Repository inventory

The current checkout contains 15 original source repositories under `third_party/`:

```text
ai-broll
ave
comfyui
cutscript
funclip
openchatcut
openmontage
openshorts
pixeltable
temporal
twick
videoagent
videoclipper
videodb-director
vimax
```

The source-first ledger counts **FFmpeg** as the sixteenth capability. FFmpeg is a system dependency and is not a repository under `third_party/`. This distinction is recorded in `docs/VENDORED_REPOSITORY_PROVENANCE.json`.

## Removed from the vendored checkout

The following were removed because they are local environments, caches, repository history, or generated artifacts rather than original worker source:

- Nested `.git` directories under `third_party/`.
- OpenShorts `.venv`, which occupied approximately 6.5 GB.
- Python bytecode and cache directories.
- Node dependency directories and build output where present.
- The generated OpenShorts `.source-first-output.mp4`.
- The generated AI-Broll `final_video_with_broll.mp4`.

The original worker source files, manifests, entrypoints, documentation, and small source-bundled model assets were preserved.

## Model status

This clean checkout contains only small model assets already present in the original source trees, including OpenShorts `yolov8n.pt` and VideoAgent auxiliary ONNX/BIN files. It does not contain FLUX, Wan, Whisper Large-v3-Turbo, Kokoro, or other large production model weights. Those must be provisioned separately or accessed through APIs.

## Size

The cleaned `third_party/` tree is approximately 848 MB instead of approximately 8.6 GB. The largest reduction came from removing the OpenShorts virtual environment and nested Git histories.

## Graph artifact policy

The full `docs/graphify-final/graph.json` is approximately 190 MB and is therefore not suitable for ordinary GitHub storage. The source repository retains the Graphify scripts, viewer, report, and batch manifest. The raw graph should be regenerated locally or stored with Git LFS/object storage.

## Provenance

The exact upstream URLs and commits captured before cleanup are stored in:

```text
docs/VENDORED_REPOSITORY_PROVENANCE.json
```

When a vendored worker is edited later, commit that change in the main Creozentic repository and update the provenance note. The source tree, not the generated Graphify graph, remains authoritative.
