# Core Engine Integration Manifest

This document records the open-source projects used as bounded core-media integrations. The application does not copy whole upstream applications into the web process. Each project is invoked or referenced through `packages/video/src/adopted-engines.ts`, and the worker receives stable Creozentic jobs.

| Engine               | Repository                                         | Role in Creozentic                                                                          | Runtime boundary                                            | License note                                          |
| -------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------- |
| OpenShorts           | https://github.com/mutonby/openshorts              | Long-form repurposing, moment detection, reframing, captions, dubbing, publish-job patterns | `apps/worker/adopted_core.py`, `OPENSHORTS_ENABLED`         | MIT core; cloud directory is separately licensed      |
| Agentic Video Editor | https://github.com/poseljacob/agentic-video-editor | Director, TrimRefiner, Editor, Reviewer orchestration reference                             | `packages/video/src/adopted-engines.ts`, `AVE_ENABLED`      | MIT                                                   |
| Pixeltable           | https://github.com/pixeltable/pixeltable           | Multimodal evidence/media index and B-roll retrieval boundary                               | `apps/worker/adopted_core.py`, `PIXELTABLE_ENABLED`         | Apache-2.0                                            |
| ViMax                | https://github.com/HKUDS/ViMax                     | Storyboard, reference consistency, generated-video branch                                   | `apps/worker/adopted_core.py`, `VIMAX_ENABLED`              | MIT                                                   |
| VideoAgent           | https://github.com/HKUDS/VideoAgent                | Video understanding/editing agent graph reference                                           | `apps/worker/adopted_core.py`, `VIDEOAGENT_ENABLED`         | MIT                                                   |
| VideoDB Director     | https://github.com/video-db/Director               | Video search and compilation boundary                                                       | `apps/worker/adopted_core.py`, `VIDEODB_DIRECTOR_ENABLED`   | MIT                                                   |
| Remotion             | https://www.remotion.dev/                          | React/TypeScript composition and rendering option                                           | `packages/video/src/adopted-engines.ts`, `REMOTION_ENABLED` | Organization and automated-use terms must be approved |
| ComfyUI              | https://github.com/Comfy-Org/ComfyUI               | Optional isolated GPU generation worker                                                     | `packages/video/src/adopted-engines.ts`, `COMFYUI_ENABLED`  | GPL-3.0; isolate and obtain legal approval            |
| Temporal             | https://github.com/temporalio/temporal             | Durable execution option for long-running jobs and approvals                                | `packages/video/src/adopted-engines.ts`, `TEMPORAL_ENABLED` | Review server/SDK terms before deployment             |
| OpenChatCut          | https://github.com/robertwyq/OpenChatCut           | Isolated raw-footage editing reference                                                      | `apps/worker/adopted_core.py`, `OPENCHATCUT_ENABLED`        | AGPL-3.0; isolate and obtain legal approval           |
| OpenMontage          | https://github.com/creozentic/openmontage          | Motion-composition reference                                                                | `apps/worker/adopted_core.py`, `OPENMONTAGE_ENABLED`        | AGPL-3.0; isolate and obtain legal approval           |
| Twick                | https://github.com/twickjs/twick                   | Node motion-composition reference                                                           | `apps/worker/adopted_core.py`, `TWICK_ENABLED`              | Sustainable Use License; review before deployment     |

## Activation rule

Every engine is disabled by default. A production operator must explicitly set its runtime flag only after the corresponding source, license, provider credentials, worker runtime, and tenant-isolation controls are approved. This prevents accidental execution of a provider or GPL/AGPL-sensitive engine.

## Canonical Creozentic contracts

Upstream projects do not own Creozentic’s domain state. All adopted executions must produce or consume the application’s canonical `MediaEvidence`, `EditPlanVersion`, `RenderJob`, `RenderOutput`, `AIUsage`, provenance, and audit records. The web API and frontend never call upstream provider SDKs directly.
