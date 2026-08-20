# Creozentic Free Trial vs Paid Production Media Pipeline

## Direct conclusion

The free and paid systems use the **same Creozentic architecture**. The difference is which model/runtime performs each stage. The EditPlan, evidence model, approvals, QA, render manifest, FFmpeg composition, and multi-version output remain the same.

Free mode substitutes free quotas, open-weight models, local runtimes, and existing/licensed media. Paid mode substitutes higher-capacity hosted models, commercial speech/voice/video services, GPU workers, cloud storage, and production queues.

A paid model is not automatically better at every task. The strongest production result normally comes from a **specialist stack**: one model for reasoning, one for transcription, one for images, one for video, one for voice, and one for music or a licensed catalog.

## Exact free pipeline

```text
Your brief
  ↓
Groq GPT-OSS 120B
  ↓
Script + hook + story beats + EDL + B-roll instructions
  ↓
Whisper Large V3 Turbo through Groq, or local Whisper
  ↓
Timed transcript and caption words
  ↓
FLUX.1-schnell ─────────┐
                        ├─ Visual assets
Wan2.2-TI2V-5B ─────────┘
  ↓
Kokoro-82M narration
  ↓
Rights-cleared music
  ↓
Creozentic EditPlan
  ↓
FFmpeg / Remotion
  ↓
Captions + voice + music + B-roll + source video
  ↓
9:16, square, landscape, and platform variants
  ↓
QA + approval + export
```

### Free stage details

| Stage | Free technology | Exact model/tool | What it does |
|---|---|---|---|
| Brief and Director | Groq | `openai/gpt-oss-120b` | Produces the script, hook options, story beats, B-roll instructions, structured EDL, and repair instructions |
| Cheap classification | Groq | `openai/gpt-oss-20b` | Caption cleanup, tagging, simple classification, and low-cost fallback |
| Transcription | Groq or local | `whisper-large-v3-turbo` or local Whisper | Produces timed text and caption words |
| Still visuals | ComfyUI | `FLUX.1-schnell` | Produces still images, product backgrounds, and visual inserts |
| Short video/B-roll | ComfyUI | `Wan2.2-TI2V-5B` | Generates short text-to-video or image-to-video inserts |
| Narration | Local Python worker | `hexgrad/Kokoro-82M` | Produces a local narration WAV |
| Music | Local/rights-cleared | Licensed music library, or Stable Audio Open for experiments | Adds background music without making the project legally unsafe |
| Composition | Local media tools | FFmpeg, Remotion, Motion Canvas boundaries | Combines source footage, generated assets, captions, audio, and graphics |
| Workflow | Local services | PostgreSQL, Redis/BullMQ, local storage | Stores projects and runs jobs |

Groq's current official documentation lists `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, and Whisper models. Its free-plan limits page lists 30 RPM and 1,000 RPD for the GPT-OSS models, with 8,000 TPM and 200,000 TPD [1] [2]. ComfyUI's official Wan2.2 guide supplies the workflow and model files and identifies the 5B workflow as the practical rapid-prototyping option [3]. Kokoro's model card lists Apache-2.0 licensing and local usage [4].

## Exact paid production pipeline

The paid pipeline should preserve the same order but use stronger specialized services:

```text
Your brief
  ↓
Premium Director + verifier
  ↓
Script + hook + story beats + EDL + B-roll instructions
  ↓
Premium transcription and diarization
  ↓
Timed transcript, words, speakers, scenes, and evidence links
  ↓
Premium image generation ───────┐
                                ├─ Consistent visual assets
Premium video generation ───────┘
  ↓
Premium commercial voice generation
  ↓
Premium music model or licensed music catalog
  ↓
Creozentic EditPlan
  ↓
GPU/parallel FFmpeg + Remotion/Motion Canvas workers
  ↓
Captions + voice + music + B-roll + source video
  ↓
9:16, square, landscape, stories, feeds, ads, and YouTube variants
  ↓
Automated QA + vision judge + human approval
  ↓
Cloud storage + export + social publishing
```

### Recommended paid specialist stack

| Stage | Recommended paid choice | Why this choice |
|---|---|---|
| Director primary | Highest-current production reasoning model available from OpenAI, Google Gemini, or Anthropic in the account; use a concrete model ID chosen from the live provider catalog | Stronger planning, long context, tool use, structured output, and fewer failed plans |
| Director verifier | A second premium model from a different provider | Catches unsupported claims, weak hooks, missing beats, and unsafe instructions |
| Transcription | Deepgram or ElevenLabs Speech-to-Text production tier | Better word timing, diarization, long-file throughput, and predictable API operation |
| Still images | Google Imagen/Nano Banana Pro, OpenAI image generation, or fal Flux/Seedream/Nano Banana models | Better instruction following, text/image editing, product consistency, and commercial service reliability |
| Video/B-roll | Google Veo 3.1 for high-end generation; Kling for motion/control; fal as a model-routing layer | Better motion consistency, camera control, realism, retries, and hosted GPU capacity |
| Voice | Latest ElevenLabs production voice model selected from the live account catalog | Natural prosody, voice identity, emotion, multilingual support, and commercial API controls |
| Music | Google Lyria where available, or a commercial licensed catalog | More usable music control; catalog licensing is safer than uncertain open-model output |
| Composition | Parallel GPU/CPU workers using FFmpeg plus Remotion/Motion Canvas | Same deterministic rules, but faster and able to render many versions concurrently |
| Workflow | Temporal or production BullMQ/Redis | Durable retries, scheduling, backpressure, and recovery |
| Storage | Cloudflare R2/S3-compatible object storage | Signed URLs, durable storage, delivery, retention, and backups |
| QA | Creozentic judges plus a premium vision/multimodal verifier | Better visual inspection, factual checks, caption checks, and platform checks |

Google's current Gemini pricing catalog lists advanced Gemini, Imagen, Veo, and Lyria families, including Veo 3.1 and Lyria 3 [5]. fal's current official pricing page lists hosted Wan, Kling, Veo, Seedream, Flux Kontext Pro, and Nano Banana model pricing [6]. ElevenLabs lists production Speech-to-Text, Text-to-Speech, voice, and sound-effect pricing [7]. OpenAI's current model documentation lists multimodal models and image-generation model pages [8] [9]. The exact model IDs and availability should be selected from the live provider dashboard immediately before activation because providers change preview and production names.

## Side-by-side workflow

| Step | Free trial | Paid production | Paid advantage |
|---|---|---|---|
| 1. Brief | Local UI sends the brief to Groq GPT-OSS 120B | Brief goes to a premium Director and possibly a second verifier | Better reasoning depth, context, factual review, and throughput |
| 2. Story plan | One free model creates hooks, beats, EDL, B-roll, and CTA | Primary model creates plan; verifier critiques it; primary repairs it | Fewer weak or contradictory plans |
| 3. Transcript | Groq Whisper free quota or local Whisper | Deepgram/ElevenLabs production STT with diarization and long-file support | Better timing, speakers, scaling, and reliability |
| 4. Evidence | Technical evidence plus available transcript | Full transcript, scenes, speakers, OCR, products, faces, motion, and audio analysis | More accurate source selection and factual proof |
| 5. Image assets | FLUX.1-schnell local or existing photos | Imagen/Nano Banana/OpenAI image/fal hosted generation | Better consistency, editing, typography, and retries |
| 6. B-roll | Wan2.2 5B local/Colab or real footage | Veo/Kling/fal hosted generation | Better motion, realism, camera movement, and predictable capacity |
| 7. Voice | Kokoro local narration | ElevenLabs production voice or another premium voice service | Better emotion, identity, accents, multilingual quality, and control |
| 8. Music | Rights-cleared free music or experimental local audio | Lyria/commercial catalog/licensed music provider | Larger catalog, clearer commercial terms, and more control |
| 9. Edit plan | Same Creozentic EditPlan, EDL, OTIO-style timeline, and render manifest | Same EditPlan, but with richer evidence and generated assets | The architecture is not replaced; inputs become richer |
| 10. Rendering | One local FFmpeg/Remotion worker | Many parallel workers and GPU/hosted rendering | Faster output and many variants at once |
| 11. QA | Local structural, factual, caption, audio, and platform checks | Same checks plus premium multimodal/vision review | Better detection of visual and semantic defects |
| 12. Publishing | Download MP4 or manually upload | OAuth-connected platforms, receipts, retries, and scheduling | Automation, scale, and operational history |

## Paid advantages in plain language

### Better brains for the plan

The free Director is already capable of making a structured plan. Paid models are helpful when the input is long, the brand rules are complicated, the product facts are numerous, or the project needs multiple revisions. A second paid model can act as a referee.

### Better eyes and ears

Paid transcription and vision services can process long media faster and return richer timestamps, speakers, scenes, OCR, faces, and audio measurements. That produces better evidence for the EditPlan.

### Better generated visuals

Paid image and video services generally provide hosted GPUs, stable model versions, higher resolution, more retries, image editing, stronger consistency, and fewer installation problems. This is most noticeable in generated video, where objects and characters must remain stable across frames.

### Better voices

Paid voice providers offer more expressive prosody, voice identity, multilingual coverage, speed control, pronunciation dictionaries, and often better commercial workflows. Kokoro is a good free narration option but is not guaranteed to match premium emotion or voice identity.

### More speed and volume

Free mode may produce one result at a time. Paid production can render many combinations in parallel:

```text
Free: 1 computer → 1 or a few videos
Paid: many workers/GPUs → many videos and variants simultaneously
```

### Better reliability

Paid cloud storage, queues, and monitoring reduce the chance that a job disappears when a local process stops. They also support retries, audit records, notifications, and scheduled publishing.

## What does not change when paying

The following Creozentic parts remain the same in both modes:

- tenant isolation;
- evidence-first planning;
- versioned EditPlans;
- hook lock and storyboard approval;
- EDL and OTIO-style timeline structures;
- scoped repair rather than random regeneration;
- render manifests and source checksums;
- QA issues and approval states;
- FFmpeg composition rules;
- platform output constraints;
- audit records and publishing receipts.

Paying changes the **quality and capacity of the inputs and workers**. It should not bypass the safety rules.

## Strongest practical paid design

The best production choice is not to ask one model to do everything. Use a routed specialist design:

```text
Premium Director model
  + premium verifier model
  + production transcription
  + premium image generation
  + Veo/Kling video generation
  + premium voice
  + licensed music
  + Creozentic EditPlan
  + deterministic FFmpeg/Remotion rendering
  + multimodal QA
  + human approval
```

That design provides stronger results than using one expensive model for every stage. It also lets Creozentic fall back to the free stack when a paid provider is unavailable.

## Final truth

The free pipeline is suitable for proving that Creozentic works. The paid pipeline is suitable for higher-quality generation, larger volume, faster turnaround, richer analysis, and production reliability.

No honest engineer can guarantee that the paid result is perfect. The correct promise is that the paid stack gives Creozentic **more capable models, more attempts, better consistency, higher capacity, and clearer service guarantees**. The final creative quality still depends on source media, evidence quality, brand instructions, rights, human review, and QA.

## References

[1]: https://console.groq.com/docs/models "Groq supported models"
[2]: https://console.groq.com/docs/rate-limits "Groq rate limits"
[3]: https://docs.comfy.org/tutorials/video/wan/wan2_2 "ComfyUI Wan2.2 official workflow"
[4]: https://huggingface.co/hexgrad/Kokoro-82M "Kokoro-82M model card"
[5]: https://ai.google.dev/gemini-api/docs/pricing "Google Gemini, Imagen, Veo, and Lyria pricing"
[6]: https://fal.ai/pricing "fal.ai model pricing"
[7]: https://elevenlabs.io/pricing/api "ElevenLabs API pricing"
[8]: https://developers.openai.com/api/docs/models "OpenAI API models"
[9]: https://developers.openai.com/api/docs/models/chatgpt-image-latest "OpenAI image model documentation"

Author: Manus AI
Date: 2026-08-19
