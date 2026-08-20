# Paid Test Stack for Uploaded-Video Editing

## Scope

This plan covers only the workflow in which the user uploads one main video and Creozentic analyzes, edits, generates supporting still-image inserts, adds captions/audio, renders variants, and performs QA. It excludes Instagram automation, social feedback loops, publishing, audience analytics, and newly generated moving video.

## Recommendation in one sentence

**Keep Groq GPT-OSS 120B and Groq Whisper Large V3 Turbo for the first test; spend first on a reliable image-generation route, then optionally add commercial voice. Do not spend $2,000–$3,000 before the editing pipeline has passed a controlled test.**

I am an AI, not a licensed financial advisor—this is analysis, not guaranteed advice; investing carries risk you bear. The recommendation assumes the amount means USD; if it means INR, the recommended first test is still within the stated amount, but the full premium comparison should be staged.

## Recommended model choices

| Editing job | Recommended first choice | Second choice | Why |
|---|---|---|---|
| Director, hook, story beats, EDL, visual prompts | Groq `openai/gpt-oss-120b` | Gemini 3.7 Flash or another premium reasoning model | The free Groq model is already large, fast, structured-capable, and inexpensive. Its output is good enough for the first editing validation. |
| Transcription and word timing | Groq `whisper-large-v3-turbo` | Deepgram or ElevenLabs Scribe | Groq lists Whisper Turbo at $0.04 per hour and describes it as fast, multilingual, and high-accuracy. Paying more is mainly useful for difficult speakers, diarization, or very long files. [1] |
| Generated still inserts | Gemini 3.1 Flash Image / Nano Banana 2 through a documented Gemini API or verified OmniRoute route | Gemini 3 Pro Image / Nano Banana Pro for a small hero-image comparison | Flash Image is the price-quality choice. Google lists 1K output at about $0.067 per image; Pro is about $0.134 per 1K/2K image. Pro is roughly twice the image cost, so use it only for a small comparison. [2] |
| Narration | Kokoro-82M for the first editing test | ElevenLabs Starter or Creator | Narration is optional for editing validation. ElevenLabs Starter costs $6/month and includes a commercial license and 30,000 credits. [3] |
| Music | Existing rights-cleared music library | ElevenLabs Music or another licensed catalog | Use an existing cleared track first. Music generation is not necessary to prove the editor. |
| Timeline and rendering | Existing FFmpeg / Remotion / Motion Canvas path | Parallel workers later | Paying for a render service does not materially improve the edit; it mainly reduces processing time. |
| QA | Existing structural/audio/caption QA plus user approval | Premium multimodal verifier | Add a premium verifier only after the basic edit output is working. |

## Is Groq GPT-OSS 120B sufficient?

**Yes, for the first editing test.** Groq lists `openai/gpt-oss-120b` at $0.15 per million input tokens and $0.60 per million output tokens, with a 131,072-token context window and reasoning capability [1]. A normal editing brief, transcript, and EditPlan request generally uses far less than one million tokens, so the Director cost per test is normally measured in cents or less.

The free model can still make planning mistakes: it may choose a weaker moment, over-write a hook, misunderstand a transcript, or request a visually unsuitable insert. Those are handled by keeping the EditPlan reviewable and allowing a repair pass. A premium Director is not the first place to spend because the final video quality is more visibly affected by transcription accuracy, image quality, source footage, and deterministic rendering.

A premium Director becomes worthwhile when the uploaded source is long, multi-speaker, noisy, multilingual, legally sensitive, or governed by complicated brand rules. For a clean one-speaker test, the expected visual difference between Groq GPT-OSS 120B and a premium Director is usually small.

## What should receive paid money first?

The first paid priority should be **generated still-image quality and reliability**. Your editor requires image inserts even though it does not require an AI video-generation model. A weak image route can make the finished edit look generic, inconsistent, or visibly artificial.

The price-quality choice is Gemini 3.1 Flash Image / Nano Banana 2. Google lists its 1K output at approximately $0.067 per image and 2K output at approximately $0.101 per image [2]. Gemini 3 Pro Image is stronger for complex brand consistency and high-control assets but costs approximately $0.134 for 1K/2K and $0.24 for 4K [2]. Since the output difference will not be large for ordinary cutaway images, use Flash Image for most inserts and reserve Pro for one or two hero assets.

## Staged budgets

### Stage 0: free architecture test

Use Groq Director, Groq Whisper Turbo, Kokoro, existing cleared music, the selected image route only if an available free quota is active, and local FFmpeg/Remotion. This proves that upload, analysis, EditPlan creation, image insertion, captions, audio mixing, rendering, QA, and export work together.

Expected external spend: **$0–$5**, excluding any account minimum or tax.

### Stage 1: minimum paid test

Test one 10–30 minute uploaded source video and produce three final variants. Generate approximately 10 still inserts, allowing one retry for each weak image. Use Groq for Director and transcription, Gemini 3.1 Flash Image for stills, Kokoro for narration, cleared music, and local rendering.

| Component | Assumption | Estimated usage cost |
|---|---:|---:|
| Groq GPT-OSS 120B | One or several small Director calls | Usually under $0.10 |
| Groq Whisper Turbo | 30 minutes of audio | About $0.02 at $0.04/hour [1] |
| Gemini 3.1 Flash Image | 20 images at about $0.067 for 1K | About $1.34 [2] |
| Kokoro narration | Local | $0 |
| Music | Existing cleared track | $0 |
| FFmpeg/Remotion | Local | $0 |
| **Estimated usage total** |  | **About $1.50–$3** |

Because providers may require a prepaid balance, billing profile, minimum charge, or tax, load only **$10–$25** for this stage. Do not load $2,000–$3,000 at once.

### Stage 2: recommended quality test

Run the same source video through the same EditPlan using two image routes: 10–15 Flash Image inserts and two or three Pro Image inserts. Add ElevenLabs Starter only if you want to compare commercial narration with Kokoro.

| Component | Estimated amount |
|---|---:|
| Flash Image inserts and retries | $1–$3 |
| Two or three Pro Image comparison assets | $0.27–$0.72 |
| Groq Director/transcription | Under $0.25 for this workload in typical usage |
| ElevenLabs Starter, optional | $6/month [3] |
| Local rendering and QA | $0 |
| **Recommended test budget** | **$10–$25** |

This stage answers the useful question: does the paid image route create a visibly better edited video than the free/local image route? It does not require a premium Director.

### Stage 3: premium comparison, only if needed

Use a premium Director for a second EditPlan, ElevenLabs narration, Gemini Pro Image for selected assets, and several repair attempts. This is a comparison experiment, not a requirement for the editor.

A sensible cap for this stage is **$50–$150**. It is enough to test multiple versions, but it is still small enough that a failed provider integration does not consume the user’s full proposed budget.

## What the $2,000–$3,000 budget should not be spent on yet

Do not spend the full amount on a Director subscription, AI video-generation credits, cloud GPU capacity, hosted rendering, social publishing infrastructure, or a large monthly SaaS plan before the uploaded-video edit has been proven.

For this editing-only test, those items do not materially improve the core result. The actual edit is created by the EditPlan, FFmpeg/Remotion, captions, audio mixing, generated stills, and QA. A video model is outside the first test.

## Expected quality difference

| Area | Groq/free-first setup | Paid-upgraded setup | Expected difference |
|---|---|---|---|
| Timeline cuts and composition | Same deterministic renderer | Same deterministic renderer | Nearly zero |
| Captions on clean audio | Strong | Slightly more robust | Small |
| Hook and EditPlan | Good with review | More consistent on difficult briefs | Small to medium |
| Generated still inserts | Free/local quality varies | Flash Image is more consistent; Pro improves difficult hero assets | Medium and most visible |
| Narration | Kokoro is usable | ElevenLabs is more natural and expressive | Medium if narration is prominent |
| Music | Depends on selected track | More catalog/control options | Small to medium |
| Rendering correctness | Same FFmpeg rules | Same rules, possibly faster | Nearly zero |
| Overall uploaded-video edit | Approximately 7.8–8.3/10 | Approximately 8.6–9.1/10 | About 8–15% overall |

These are engineering estimates, not a standardized benchmark. If the source footage and audio are clean, the difference may be closer to 5–10%. If the audio is noisy, the source is very long, or the generated stills occupy much of the video, the difference can approach 15–20%.

## Final recommended spend

The correct first payment is **not $2,000–$3,000**. Start with:

```text
$10–$25: first paid integration test
$25–$75: recommended repeated test with retries and image comparison
$50–$150: optional premium Director/voice/hero-image comparison
```

Only consider spending more after the following evidence exists: the same uploaded source has produced a correct EditPlan, at least one generated still has appeared at the planned timeline interval, captions are correctly timed, audio passes QA, the final render is persisted, and the user can approve or repair the output.

If the user’s “2–3K” means **Indian rupees**, the full first test can be done within that amount by keeping Groq, Whisper, Kokoro, music, and rendering free and purchasing only a small image-generation balance. If it means **US dollars**, the amount is far above what is needed for this test and should remain uncommitted until the quality comparison justifies further spending.

## References

[1]: https://console.groq.com/docs/models "Groq supported models and pricing"
[2]: https://ai.google.dev/gemini-api/docs/pricing "Google Gemini Developer API pricing"
[3]: https://elevenlabs.io/pricing "ElevenLabs official pricing"
