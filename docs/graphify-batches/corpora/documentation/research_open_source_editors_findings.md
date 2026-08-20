# Open-source uploaded-video editor research findings

## Source

OpenShorts repository: https://github.com/mutonby/openshorts

## Verified claims from the repository README and visible project metadata

OpenShorts is an open-source AI video platform with a self-hosted Docker deployment. The repository describes a Python 3.11/FastAPI backend, React/Vite/Tailwind frontend, FFmpeg processing, faster-whisper, YOLOv8, MediaPipe, and AWS S3 integration. It accepts long-form videos and produces short-form clips, with a separate AI Shorts path for generated marketing videos.

The repository describes transcript editing, word-level subtitles, styled caption burning, manual framing overrides, face tracking, smart reframing, and FFmpeg-based rendering. Its B-roll path is described as generated visual stills from image models such as Flux 2 Pro, commonly animated with Ken Burns effects. This is relevant to Creozentic’s still-image B-roll workflow, but it does not by itself prove a complete autonomous policy that chooses between generated stills and generated moving video.

The README says the core application is MIT-licensed. It separately states that cloud/managed infrastructure components are source-available under an OpenShorts Commercial License, so those parts must not be treated as unrestricted MIT code for a hosted commercial product.

The repository exposes MCP, REST, webhooks, CLI, and agent-skill automation. The current repository view showed a recent clip-editor area, Remotion rendering work, and an importable n8n example, but those are still separate surfaces that need source-level verification before integration.

## Relevance to Creozentic

OpenShorts is a strong candidate for transcript/caption/short-clip/reframe patterns and still-image B-roll. It is not evidence that one open-source project already implements all of Creozentic’s required controls: EditPlan provenance, generated-still approval, generated-video B-roll selection, deterministic fallback, asset checksums, tenant isolation, and the existing Creozentic UI contracts.

## AI-Broll candidate

Repository: https://github.com/Anil-matcha/AI-B-roll

The repository is a small MIT-licensed Jupyter notebook project with example input and output videos. Its README says it generates B-roll for a video using AI and links to MuAPI for generating image/video assets. It is useful as a proof-of-concept for transcript/scene-to-generated-B-roll experimentation, but it is not a production editor: it has no demonstrated multi-tenant asset model, approval workflow, deterministic EditPlan, robust timeline contract, provider abstraction, or complete self-hosted generation stack. It appears to depend on a third-party MuAPI route for the actual generation. It should not replace Creozentic; at most, its prompt/B-roll experiment can inform an isolated adapter.

## CutScript candidate

Repository: https://github.com/DataAnts-AI/CutScript

CutScript is an MIT-licensed local-first, Descript-like text-based video editor. It supports word-level WhisperX transcription and alignment, transcript-driven deletion/editing with undo/redo, AI filler-word removal, AI clip creation, captions, FFmpeg stream-copy/re-encode export, audio cleanup, speaker diarization, and a React/Electron frontend backed by FastAPI/Python.

It is a strong candidate for transcript-driven editing mechanics and local Python/FFmpeg integration. It does not document generated still-image B-roll, generated moving B-roll, an EditPlan with evidence/provenance, visual-insert approval, or a still-versus-video B-roll decision agent. It should be considered a component/reference for transcript editing and audio cleanup, not a complete replacement for Creozentic.

## IMG.LY VideoClipper candidate

Repository: https://github.com/imgly/videoclipper

VideoClipper is a browser-oriented long-video-to-short-video application. The repository shows a Next.js/React/TypeScript implementation with video templates, an application layer, audio extraction, transcript utilities, and caption-quality work involving speaker boundaries and sentence detection. It is relevant for source-video clipping, multi-speaker layouts, caption handling, and browser-side composition patterns.

The repository is associated with IMG.LY/CreativeEditor SDK ecosystem. Before copying code into a commercial product, its exact SDK and automated-use licensing must be checked; the repository itself is not enough evidence that all dependencies are permissively licensed. The visible repository materials do not establish generated still B-roll, generated moving B-roll, an autonomous B-roll medium selector, or Creozentic-style evidence/approval contracts. It is a useful UI/composition reference, not a complete replacement.

## FunClip candidate

Repository: https://github.com/modelscope/FunClip

FunClip is a fully open-source, locally deployed Python/Gradio video clipping tool. It uses FunASR/Paraformer-family speech recognition, timestamps, hotword customization, speaker recognition, LLM-assisted clipping, multi-segment selection, and SRT output. It is a strong ASR and transcript-to-clip reference, including Chinese and multilingual use cases. It does not provide generated still or moving B-roll, an EditPlan asset-approval system, or a complete compositing workflow. It should be treated as an ASR/clipping worker candidate, not a full replacement.

## n8n prompt-to-video workflow candidate

Workflow: https://n8n.io/workflows/10502-create-ai-videos-from-prompts-with-openai-script-tts-and-pexels-b-roll-assembly/

The workflow accepts a topic prompt, generates a script and voiceover, searches Pexels for stock footage, creates SRT subtitles, and prepares scene components for FFmpeg/manual assembly. It does not accept an uploaded source video as the primary input, does not analyze source footage, does not decide still versus moving B-roll, and does not implement approval or evidence-aware editing. It is useful as an orchestration pattern only, not as the core uploaded-video editor.
