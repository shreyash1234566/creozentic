# Creozentic Uploaded-Video Editing Only

## Scope

This document covers only the workflow in which the user uploads an existing video and Creozentic edits that video. It does not include text-to-video, image-to-video, synthetic presenters, invented B-roll, or any other AI-video-generation workflow.

> **Core conclusion:** Free and paid editing use the same editing features and the same Creozentic EditPlan. Paid mode mainly improves transcription, analysis, voice, music, QA, speed, retries, and operational reliability. It does not create a different editor.

## Complete editing-only workflow

```text
1. User uploads an existing video
        ↓
2. Validate file and create a project/version
        ↓
3. Inspect media with FFmpeg/ffprobe
   duration, resolution, frame rate, codecs, audio tracks, file health
        ↓
4. Extract proxy media and audio where necessary
        ↓
5. Transcribe speech
   word timestamps, sentence timestamps, speaker information when available
        ↓
6. Analyze the uploaded footage
   scenes, silence, pauses, topics, faces, objects, OCR, audio quality,
   important moments, repeated sections, and possible cut points
        ↓
7. Director creates an EditPlan
   hook, story beats, selected source ranges, cut instructions, captions,
   overlays, music timing, CTA, output aspect ratios, and QA requirements
        ↓
8. User reviews or approves the plan
        ↓
9. Deterministic editor executes the plan
   FFmpeg / Remotion / Motion Canvas
        ↓
10. Apply the edit
    cuts, trims, joins, silence removal, jump cuts, zooms, reframing,
    captions, overlays, graphics, audio mix, music, and optional narration
        ↓
11. Render variants
    9:16, square, landscape, and platform-specific resolutions
        ↓
12. Run QA
    duration, black frames, missing media, caption timing, loudness,
    clipping, aspect ratio, safe zones, and visual defects
        ↓
13. User approves or requests a scoped repair
        ↓
14. Export final video files and edit metadata
```

## What the uploaded-video editor actually does

| Editing function | Required? | Free | Paid | AI-video generation required? |
|---|---:|---|---|---:|
| Upload and validate a video | Yes | Local upload/storage | Hosted or local upload/storage | No |
| Read technical metadata | Yes | FFmpeg/ffprobe | FFmpeg/ffprobe | No |
| Detect corrupted or unsupported media | Yes | FFmpeg/ffprobe | FFmpeg/ffprobe plus monitoring | No |
| Extract audio | Usually | FFmpeg | FFmpeg | No |
| Transcribe speech | Usually | Local Whisper or Groq Whisper | Deepgram, ElevenLabs Scribe, or another production STT service | No |
| Produce word timestamps | For accurate captions | Whisper timestamps | Production STT timestamps | No |
| Detect speakers | Optional | Limited or local diarization | Production diarization | No |
| Detect scenes | Useful | FFmpeg/OpenCV/local analysis | Hosted vision/media analysis | No |
| Find important moments | Yes for automatic editing | Groq Director plus transcript | Premium Director plus verifier | No |
| Remove silence | Optional | FFmpeg plus transcript/audio analysis | Same | No |
| Create jump cuts | Optional | EditPlan plus FFmpeg | Same | No |
| Select source ranges | Yes | EditPlan | EditPlan | No |
| Create captions | Yes when requested | Whisper plus Remotion/FFmpeg | Same output path with better transcription | No |
| Add animated captions | Optional | Remotion/Motion Canvas | Same | No |
| Add titles and overlays | Optional | Remotion/Motion Canvas | Same | No |
| Reframe from landscape to vertical | Optional | FFmpeg/Remotion | Same | No |
| Add zooms and pans | Optional | FFmpeg/Remotion/Motion Canvas | Same | No |
| Add music | Optional | Rights-cleared music file | Licensed catalog or paid music service | No |
| Mix voice, source audio, and music | Yes when audio is used | FFmpeg | FFmpeg plus better audio analysis | No |
| Add generated narration | Optional | Kokoro-82M | Premium commercial voice | No; this is audio generation, not video generation |
| Apply color or basic enhancement | Optional | FFmpeg filters | Better hosted enhancement if selected | No |
| Render final video | Yes | FFmpeg/Remotion | Parallel FFmpeg/Remotion workers | No |
| Render 9:16, square, and landscape | Optional | FFmpeg/Remotion | Same, faster and in parallel | No |
| Validate output | Yes | Local QA judges | Same QA plus premium multimodal judge | No |
| Repair a failed edit | Optional | Re-run the affected stage | Faster retries and stronger diagnosis | No |

## Free editing pipeline

```text
Uploaded video
  ↓
FFmpeg / ffprobe
  ↓
Local Whisper or Groq Whisper Large V3 Turbo
  ↓
Groq GPT-OSS 120B Director
  ↓
Transcript + selected moments + EditPlan
  ↓
User approval
  ↓
FFmpeg / Remotion / Motion Canvas
  ↓
Cuts + captions + overlays + audio mix + music
  ↓
QA
  ↓
Export
```

The free pipeline can complete the entire editing workflow without a video-generation model. It can also work without image generation, because it can use the uploaded video, text overlays, captions, existing images, and existing music.

## Paid editing pipeline

```text
Uploaded video
  ↓
FFmpeg / ffprobe and production media inspection
  ↓
Production speech-to-text and diarization
  ↓
Premium Director model + second verifier
  ↓
Transcript + speakers + scenes + OCR + audio evidence + EditPlan
  ↓
User approval
  ↓
Parallel FFmpeg / Remotion / Motion Canvas workers
  ↓
Cuts + captions + overlays + audio mix + licensed music
  ↓
QA judges + premium multimodal review
  ↓
Scoped repair if required
  ↓
Export
```

The paid pipeline still does not require a video-generation model. A video model is only added if the user separately asks to invent a new video clip, which belongs to the separate AI-video-generation system.

## Same features versus changed implementation

| Area | Same in both? | What changes in paid mode |
|---|---:|---|
| Editing concept | Yes | Nothing |
| EditPlan structure | Yes | Better evidence may produce a better plan |
| Source-footage cutting | Yes | Better analysis may select better ranges |
| Caption placement | Yes | Better transcription may reduce errors |
| Audio mixing | Yes | Better audio analysis and voice quality |
| Overlays and graphics | Yes | Optional premium still assets, if requested |
| Reframing | Yes | Same deterministic transform |
| Transitions | Yes | Same deterministic transform |
| Music placement | Yes | Better or more clearly licensed music options |
| Export formats | Yes | More parallel exports |
| QA rules | Yes | Stronger visual and audio judge |
| User approval | Yes | Better repair explanations and evidence |
| Video generation | No, not part of editing-only scope | Still not required |

## Free versus paid model differences

| Editing task | Free choice | Paid choice | Expected difference |
|---|---|---|---|
| Media inspection | FFmpeg/ffprobe | FFmpeg/ffprobe plus production monitoring | Reliability, not visual quality |
| Transcription | Local Whisper or Groq Whisper Large V3 Turbo | Deepgram, ElevenLabs Scribe, or equivalent | Better long-file throughput, diarization, and sometimes timestamps |
| Director | Groq GPT-OSS 120B | Premium reasoning model | Better complex planning and fewer reasoning errors |
| Verification | Local deterministic and model judges | Second premium verifier plus local judges | Better detection of weak selections and unsupported claims |
| Captions | Same Remotion/FFmpeg renderer | Same renderer | Main difference is transcription accuracy |
| Voice | Kokoro-82M | Premium commercial voice | Better naturalness, emotion, and pronunciation |
| Music | Existing rights-cleared music | Licensed catalog or paid music service | Better selection and licensing workflow |
| Graphics | Existing assets and deterministic templates | Same templates plus optional premium still assets | More asset choices, not a different editor |
| Render execution | One local worker | Parallel workers | Lower waiting time |
| QA | Local structural/audio/platform checks | Same plus premium visual judge | Better defect detection |

## Quality comparison for uploaded footage

The quality of the final edit depends on two different things:

1. **Editing quality:** whether the correct moments are selected, ordered, captioned, mixed, and rendered.
2. **Source quality:** whether the uploaded footage has good audio, lighting, framing, content, and usable moments.

Paid models mostly improve the first category. They cannot turn a blurry, badly recorded, missing-context source video into perfect source material.

| Source condition | Free editing result | Paid editing result | Expected gap |
|---|---|---|---|
| Clear speech, good lighting, one speaker, simple edit | Very close to paid | Slightly more polished | 0–5% visible difference |
| Several speakers, long video, difficult search | Good with review | More reliable selection and diarization | 5–15% |
| Heavy accents, noise, overlapping speech | More manual correction | Better transcript and audio evidence | 10–20% |
| Many scenes, products, slides, OCR, and brand rules | More planning mistakes possible | Better evidence and verification | 10–20% |
| Poor source footage or missing shots | Both are limited | Paid may diagnose problems better | Source quality remains the bottleneck |

A practical weighted example for mostly real footage is:

```text
Free  = 8.225 / 10
Paid  = 9.060 / 10
Gap   = 0.835 points, approximately 10.2% relative to free
```

This is an estimate, not a guaranteed benchmark. If the footage is simple and clean, the visible difference can be near zero. If the project requires difficult transcription and complex source selection, the difference becomes more noticeable.

## What the free editor is not missing

The free editor is not missing the essential editing workflow. It can receive a video, inspect it, transcribe it, identify important moments, create an EditPlan, cut the source footage, create captions, add overlays, mix audio, render variants, perform QA, and export.

The paid editor does not add a hidden second timeline or a different editing philosophy. It improves the probability that each step is correct and reduces waiting time.

## What is deliberately excluded

The following are not part of this editing-only comparison:

| Excluded item | Reason |
|---|---|
| Text-to-video generation | Separate AI-video-generation product |
| Image-to-video generation | Separate AI-video-generation product |
| Synthetic presenters | Separate generation feature |
| Invented B-roll | Separate generation feature |
| Instagram or TikTok publishing | Operational/publishing feature |
| Social feedback collection | Growth and analytics feature |
| Automatic improvement from social reactions | Agentic optimization feature |
| Cloud hosting | Deployment concern rather than editing capability |
| Account subscriptions | External setup concern |

## Minimum requirements for your first editing test

```text
Uploaded video
+ FFmpeg / ffprobe
+ Whisper or Groq transcription
+ Groq GPT-OSS 120B or another Director
+ Creozentic EditPlan
+ FFmpeg / Remotion rendering
+ captions and audio QA
```

You do not need:

```text
A video-generation model
FLUX.1-schnell
Wan2.2
A premium image model
A premium video model
```

Those can remain disabled while you test uploaded-video editing.

## Final answer

For uploaded-video editing, the free and paid versions have the **same main features, same concepts, same stages, and same editing architecture**.

The free version uses less expensive or local models and may require more manual correction. The paid version uses stronger transcription, reasoning, voice, music, verification, and infrastructure. Therefore, paid mode generally produces more reliable decisions, fewer caption or analysis errors, better audio, and faster renders—but it does not provide a fundamentally different editor.

```text
Editing features: same
Editing workflow: same
EditPlan: same
Timeline/render boundary: same
AI-video generation: not required in either editing workflow
Model quality: different
Analysis richness: different
Speed and reliability: different
```

Author: Manus AI
Date: 2026-08-19
