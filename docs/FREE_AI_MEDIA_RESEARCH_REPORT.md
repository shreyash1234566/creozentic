# Creozentic Free-First AI Media Research Report

## Executive conclusion

Creozentic can be tested without paying for most of its **editing and orchestration**. The strongest free trial path is not one magical free website. It is a hybrid pipeline: use a hosted free language model for the Director, local or notebook-hosted open models for images/video/voice, licensed music or local music generation for experiments, and Creozentic's existing FFmpeg/Remotion-style composition and QA boundaries.

The most important newly confirmed option is Groq's hosted `openai/gpt-oss-120b` model. Groq's official model page lists it as an available open-weight model, and its free-plan limits page lists 30 requests per minute, 1,000 requests per day, 8,000 tokens per minute, and 200,000 tokens per day for that model [1] [2]. This is a strong free candidate for the Director, caption planning, hook selection, structured EDL instructions, and automation reasoning.

This does **not** mean that every free pipeline will equal the best paid video generator. Free text generation can be close for many planning tasks. Free local voice can be very good. Free local image/video generation can be useful, but paid hosted video services normally have better temporal consistency, speed, reliability, and output selection. The free pipeline should therefore use generated video selectively and rely on real footage, still images, motion graphics, and deterministic editing whenever possible.

## What is currently in Creozentic

The repository currently contains provider policies and boundaries, not final model IDs for every media type. The AI package currently routes `director` to Gemini with the symbolic model name `structured-director`, `caption` to OpenAI with `caption-normalizer`, and `image` to fal with `image-generation`. These are policy placeholders. They are not yet concrete model identifiers.

The adopted repositories provide orchestration, editing, indexing, rendering, motion, and worker boundaries. ComfyUI is a model-agnostic workflow engine; Remotion and FFmpeg render; Temporal orchestrates; Pixeltable indexes media; AVE, OpenShorts, ViMax, and VideoAgent coordinate workflows. The actual model checkpoints or hosted model IDs must be selected separately.

## Recommended free trial stack

| Stage | Recommended free trial choice | Exact model or tool | Cost reality | Creozentic integration |
|---|---|---|---|---|
| Director/script | Groq | `openai/gpt-oss-120b` | Free-plan quota; official limits apply | OpenAI-compatible AI adapter with structured JSON validation |
| Director fallback | Google Gemini API | A currently free-eligible Gemini model shown in AI Studio | Free tier with limited access; data-use terms apply | Existing Gemini provider route |
| Director second fallback | OpenRouter | Any currently available model ID ending in `:free` | 20 RPM and 50 RPD without purchased credits according to current docs; model availability changes [3] | OpenAI-compatible adapter |
| Speech-to-text | Groq or local Whisper | `whisper-large-v3-turbo` on Groq, or OpenAI Whisper locally | Groq free limits; local Whisper uses your hardware | Speech gateway or Python worker |
| Text-to-speech | Local Kokoro | `hexgrad/Kokoro-82M` | Free to run locally; Apache-2.0 model card [4] | Python worker adapter |
| Still images | Local ComfyUI | `FLUX.1-schnell` | Free model weights; requires capable GPU; Apache-2.0 model card [5] | ComfyUI HTTP boundary |
| Short AI B-roll/video | Local ComfyUI | `Wan2.2-TI2V-5B` | Free weights; GPU required; official ComfyUI guide says the 5B workflow is designed for rapid prototyping and can fit around 8 GB VRAM with offloading [6] | ComfyUI/worker boundary |
| Heavier video | Local HunyuanVideo | HunyuanVideo or HunyuanVideo-1.5 | Free code/weights under its repository terms, but much heavier than Wan 5B | GPU worker boundary |
| Music experiment | Local Stable Audio Open | `stable-audio-open-1.0` | Free weights but license must be checked for commercial use; outputs up to 47 seconds [7] | Audio-generation boundary |
| Commercial-safe music trial | Rights-cleared music library | No AI model | Usually free for selected tracks, but every track license must be checked | Asset library and rights evidence |
| Composition | Local FFmpeg | `ffmpeg` and `ffprobe` | Free | Already implemented |
| Motion graphics | Remotion/Motion Canvas | Code-based scenes, no model required | Free/open-source boundary subject to license review | Existing renderer boundary |
| Multi-version rendering | Local worker/queue | FFmpeg plus typed render manifests | Free on local machine | Existing worker and render-manifest boundary |

## Stage-by-stage analysis

### 1. Script, Director, and automation reasoning

#### Best free hosted option: Groq `openai/gpt-oss-120b`

Groq's official catalog lists `openai/gpt-oss-120b` with a 131,072-token context window and up to 65,536 completion tokens on its production catalog. The free-plan limits page lists 30 RPM, 1,000 RPD, 8,000 TPM, and 200,000 TPD [1] [2]. This is enough for a trial editor that creates briefs, hooks, beat maps, caption plans, B-roll instructions, structured EDL decisions, repair scopes, and platform variants.

The important limitation is that the free plan is a **rate-limited hosted service**, not an unlimited production backend. The application must implement exponential backoff, retry-after handling, request budgets, structured-output validation, and a fallback route.

Recommended routing:

```text
Director request
  -> Groq openai/gpt-oss-120b
  -> if rate-limited, Gemini Free
  -> if unavailable, OpenRouter :free model
  -> if all unavailable, deterministic template planner
```

Groq also lists `openai/gpt-oss-20b`, which is faster and lighter, and `whisper-large-v3` plus `whisper-large-v3-turbo` for speech recognition [1]. Use the 120B model for the Director and the 20B model for cheap caption cleanup or classification when the task does not require deep reasoning.

#### Gemini Free

Google's current Gemini pricing page states that the Free tier provides limited access to selected models, free input/output tokens, and Google AI Studio access, while the Paid tier provides higher rate limits, advanced model access, context caching, batch access, and stronger data-use separation [8]. Gemini remains useful as a fallback or primary trial Director, but the exact free-eligible model should be selected from the current AI Studio account rather than hard-coded from an old blog post.

#### OpenRouter free models

OpenRouter's official limits documentation states that free variants use the `:free` suffix. The current documentation lists 20 requests per minute and 50 requests per day for accounts with less than 10 purchased credits, with a higher daily allowance after credits are purchased [3]. OpenRouter is useful as a fallback and model-comparison service, but it is less predictable than Groq because free model availability and upstream capacity change.

#### Hugging Face Inference Providers

Hugging Face currently provides a unified API to many providers and models. Its official pricing page lists $0.10 monthly credits for free users, subject to change, with additional usage requiring purchased credits [9]. This is useful for tiny experiments and model discovery, but it is not enough to power a full video factory. It is better used to test a model in the browser or make a few proof-of-concept calls.

### 2. Captions and speech-to-text

For the trial, use Groq's hosted `whisper-large-v3-turbo` if its free limits are available, or run OpenAI Whisper locally. Groq's current catalog lists `whisper-large-v3-turbo` with audio-hour pricing for paid use and the free-plan limits page lists 20 RPM, 2,000 RPD, 7,200 audio seconds per hour, and 28,800 audio seconds per day [1] [2].

The workflow should be:

```text
Video/audio
  -> speech-to-text
  -> words with start/end times
  -> sentence and speaker grouping
  -> caption safe-zone layout
  -> caption QA
  -> render
```

The transcript is not just text. It is a time map. The Editor uses it to align captions, find hooks, remove dead air carefully, attach claims to evidence, and preserve the correct spoken segment.

### 3. Image generation

The strongest free local image candidate identified is `black-forest-labs/FLUX.1-schnell`. Its model card describes a fast distilled image model and lists Apache-2.0 licensing [5]. It can be used through ComfyUI, Diffusers, or a local Python worker. It is still a large model; a capable GPU is strongly preferred.

A free hosted alternative is not reliably unlimited. Hugging Face gives free users only a small monthly inference credit, and free web demos can disappear or become congested [9]. Therefore, for a repeatable trial, use local FLUX if the machine has suitable hardware, otherwise use existing product photos, public-domain material, or rights-cleared stock media and let Creozentic animate/crop/compose them.

### 4. AI video and B-roll

The best practical free model for a trial is `Wan2.2-TI2V-5B` in ComfyUI. The official ComfyUI documentation describes Wan2.2 as supporting text-to-video and image-to-video, provides the exact model files and workflow templates, and states that the 5B version is intended for rapid prototyping and can fit around 8 GB VRAM with native offloading [6]. The same documentation lists the model files, VAE, and text encoder that must be placed in the ComfyUI model directories.

Recommended B-roll strategy:

```text
1. Use verified user footage first.
2. Use rights-cleared still/image assets second.
3. Use local FLUX still images with motion graphics third.
4. Use Wan2.2-TI2V-5B for short image-to-video inserts.
5. Use heavier HunyuanVideo only when a GPU is available and the shot is worth the cost.
```

HunyuanVideo's official repository describes a 13B-parameter video foundation model, supplies inference code and weights, and describes text-to-video, image-to-video, and related applications [10]. It is a serious open option, but it is much more demanding than Wan 5B. It should not be the first free trial target unless a suitable GPU is already available.

Paid video services such as fal's Wan 2.5, Kling 2.5 Turbo Pro, and Veo 3 provide hosted inference and output-based pricing [11]. They reduce setup difficulty and improve speed/reliability, but they are not required for the first editing trial.

### 5. Voice generation

Kokoro-82M is the best free local starting point. Its official model card describes an 82-million-parameter open-weight TTS model, lists Apache-2.0 licensing, and provides a local Python usage example [4]. It is much lighter than large voice-cloning systems and is appropriate for narration, explainers, and controlled voice-over.

Kokoro is not guaranteed to match a premium paid voice provider for emotional performance, custom voice identity, multilingual coverage, or voice cloning. For a free trial, it is good enough to test the complete workflow:

```text
approved script
  -> Kokoro narration WAV
  -> loudness normalization
  -> duck music under speech
  -> mix with source audio
  -> QA for clipping and intelligibility
```

Do not clone a real person’s voice without documented permission.

### 6. Music and sound design

Stable Audio Open can generate variable-length stereo audio up to 47 seconds. Its official materials describe the model and its release terms, but the model license is not the same as a blanket commercial music license [7]. MusicGen and similar open models also require careful license review.

For commercial testing, the safest free path is often a rights-cleared music library where each track's license is stored as evidence. For experimental internal videos, Stable Audio Open or MusicGen can be tested locally, but the output should be marked as requiring license review before publication.

### 7. Composition and many versions

Composition does not require a generative model. Creozentic can use FFmpeg, Remotion, Motion Canvas, and its own render-manifest/EDL/OTIO boundaries. This is the part where free local execution can be genuinely equivalent to paid execution because the operation is deterministic.

```text
one approved plan
  -> version A: 9:16 / TikTok style
  -> version B: 9:16 / Reels style
  -> version C: 1:1 / feed style
  -> version D: 16:9 / YouTube style
```

The system should reuse the same evidence and approved narrative while changing platform constraints, caption placement, duration, CTA, and output format. Paid infrastructure adds parallel workers and faster rendering; it does not fundamentally improve the correctness of FFmpeg composition.

## The practical free trial architecture

```text
                    +-------------------------+
                    | Groq GPT-OSS 120B       |
                    | Director / script / EDL |
                    +------------+------------+
                                 |
                                 v
+-------------+       +-------------------------+
| Whisper     | ----> | Creozentic EditPlan    |
| STT         |       | memory + evidence + QA |
+-------------+       +-----------+-------------+
                                 |
             +-------------------+-------------------+
             |                                       |
             v                                       v
+-------------------------+             +-------------------------+
| FLUX.1-schnell          |             | Wan2.2-TI2V-5B          |
| stills/product visuals  |             | short B-roll/video      |
+------------+------------+             +------------+------------+
             |                                       |
             +-------------------+-------------------+
                                 v
                    +-------------------------+
                    | Kokoro-82M TTS         |
                    | narration voice        |
                    +------------+------------+
                                 |
                                 v
                    +-------------------------+
                    | FFmpeg / Remotion      |
                    | captions + audio + QA  |
                    | many platform versions |
                    +-------------------------+
```

The image and video boxes can run locally, in a free notebook GPU session when available, or through a later paid hosted endpoint. A free notebook GPU is not guaranteed: Google Colab says free GPU/TPU access is available but usage is dynamic, and Kaggle documents weekly GPU quotas that can change with resource availability [12] [13]. Treat notebooks as trial environments, not production infrastructure.

## Creozentic configuration recommendation

Do not replace the existing generic provider policy with untracked magic strings. Add explicit model configuration such as:

```env
DIRECTOR_PROVIDER=groq
DIRECTOR_MODEL=openai/gpt-oss-120b
DIRECTOR_FALLBACK_PROVIDER=gemini
DIRECTOR_FALLBACK_MODEL=<current-free-eligible-gemini-model>
CAPTION_PROVIDER=groq
CAPTION_MODEL=openai/gpt-oss-20b
STT_PROVIDER=groq
STT_MODEL=whisper-large-v3-turbo
IMAGE_PROVIDER=comfyui
IMAGE_MODEL=FLUX.1-schnell
VIDEO_PROVIDER=comfyui
VIDEO_MODEL=Wan2.2-TI2V-5B
TTS_PROVIDER=local-kokoro
TTS_MODEL=hexgrad/Kokoro-82M
MUSIC_PROVIDER=licensed-library
MUSIC_MODEL=none
```

The secret keys must remain server-side:

```env
GROQ_API_KEY=
GEMINI_API_KEY=
HF_TOKEN=
COMFYUI_BASE_URL=http://127.0.0.1:8188
COMFYUI_API_KEY=
LOCAL_TTS_ENABLED=true
LOCAL_TTS_MODEL=hexgrad/Kokoro-82M
```

The exact values should be enabled only after checking the current provider account, accepted terms, model availability, and model license. No `NEXT_PUBLIC_` variable should contain a secret.

## Free versus paid comparison

| Dimension | Free trial stack | Paid stack |
|---|---|---|
| Director | Groq/Gemini/OpenRouter limits | Higher limits, stable throughput, premium model access |
| Image generation | Local FLUX or small hosted credits | Hosted Flux/Seedream/Nano Banana and retries |
| Video generation | Wan 5B/Hunyuan in free notebook/local GPU | fal Wan/Kling/Veo or rented GPUs |
| Voice | Kokoro/local Whisper | Premium TTS, cloning, diarization, managed ASR |
| Music | Rights-cleared library or experimental local model | Licensed catalog or paid generation provider |
| Rendering | Local FFmpeg and one worker | Parallel GPU/CPU workers, autoscaling, faster output |
| Reliability | Session may stop; quotas may change | SLA-like hosted capacity and monitoring |
| Commercial use | Must inspect every model/media license | Provider terms may be clearer but still require review |
| Output quality | Good for scripts, narration, edits; variable for generated video | Usually stronger consistency and selection for generated media |
| Cost | $0 if local/free quotas are available | Usage-based and infrastructure charges |

## Final recommendation

For a truly free trial, change the project’s first real provider configuration to **Groq `openai/gpt-oss-120b` for the Director**, use **Groq Whisper Large V3 Turbo or local Whisper for transcription**, use **Kokoro-82M for voice**, use **FFmpeg for composition**, and use **FLUX.1-schnell plus Wan2.2-TI2V-5B only when a free GPU session or capable local GPU is available**. Use a rights-cleared music library until music-model licensing is understood.

This is the best free-first architecture found in the current research. It is materially more useful than leaving the project on symbolic `structured-director`, `caption-normalizer`, and `image-generation` placeholders. It still cannot promise that free generated video will equal every premium paid model. It can, however, exercise the complete Creozentic workflow now and provide a credible path to paid upgrades later without changing the core application architecture.

## References

[1]: https://console.groq.com/docs/models "Groq supported models"
[2]: https://console.groq.com/docs/rate-limits "Groq rate limits"
[3]: https://openrouter.ai/docs/api_reference/limits "OpenRouter limits"
[4]: https://huggingface.co/hexgrad/Kokoro-82M "Kokoro-82M model card"
[5]: https://huggingface.co/black-forest-labs/FLUX.1-schnell "FLUX.1-schnell model card"
[6]: https://docs.comfy.org/tutorials/video/wan/wan2_2 "ComfyUI official Wan2.2 workflow"
[7]: https://huggingface.co/stabilityai/stable-audio-open-1.0 "Stable Audio Open model card"
[8]: https://ai.google.dev/gemini-api/docs/pricing "Gemini Developer API pricing"
[9]: https://huggingface.co/docs/inference-providers/pricing "Hugging Face Inference Providers pricing"
[10]: https://github.com/Tencent-Hunyuan/HunyuanVideo "Tencent HunyuanVideo repository"
[11]: https://fal.ai/pricing "fal.ai official pricing"
[12]: https://research.google.com/colaboratory/faq.html "Google Colab FAQ"
[13]: https://www.kaggle.com/docs/notebooks "Kaggle Notebooks documentation"

Author: Manus AI
Date: 2026-08-19

> This report is a research and engineering recommendation, not a promise of provider availability, quota permanence, or commercial model-license clearance. Re-check each official source before activation.

