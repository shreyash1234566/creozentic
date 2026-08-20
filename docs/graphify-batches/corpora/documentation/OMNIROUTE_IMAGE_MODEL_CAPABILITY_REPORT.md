# OmniRoute Image-Model Capability Report for Creozentic

## Executive confirmation

**Yes, OmniRoute can provide image-capable routes that Creozentic can use for generated still-image inserts while editing an uploaded video.** The confirmed routes are not all equivalent, however.

The most important distinction is between **OmniRoute’s local gateway key** and the upstream account credentials. OmniRoute gives Creozentic a local OpenAI-compatible endpoint, normally `http://localhost:20128/v1`, and a local bearer key. That local key does not transform a ChatGPT cookie, Antigravity OAuth token, Codex OAuth credential, or Gemini session into a permanent OpenAI or Google API key. It authorizes Creozentic to call OmniRoute; OmniRoute then uses the separately configured upstream session or OAuth connection.

```text
Creozentic
  ↓  local OmniRoute bearer key
http://localhost:20128/v1
  ↓  provider adapter
ChatGPT cookie / Codex OAuth / Antigravity OAuth / Gemini Web cookie
  ↓
Upstream image-capable route
```

## Definitive capability matrix

| Route | OmniRoute image route confirmed? | Credential type | Text-to-image | Edit arbitrary uploaded reference images | Suitable for Creozentic still inserts? |
|---|---:|---|---:|---:|---:|
| `antigravity/gemini-3.1-flash-image` | Yes in current source | Antigravity/Google OAuth | Yes | Not confirmed in current handler; current source sends text prompt only | **Yes for generated stills** |
| `gemini-web/nano-banana-web` | Yes in merged release v3.8.50 | Gemini Web cookie/session | Yes | No native reference-edit path documented in the handler | **Yes for generated stills, experimental** |
| `chatgpt-web/gpt-5.5` | Yes | ChatGPT Web cookie/session | Yes | Limited/stateful; edits depend on an image recently generated through the same OmniRoute instance | **Yes for generated stills; not ideal for arbitrary edits** |
| `codex/gpt-5.6-sol` or `gpt-5.6-terra` | Yes in current source | Codex/ChatGPT OAuth | Yes | **Yes, through the hosted `image_generation` tool and `input_image` items** | **Yes; strongest route for reference-image editing** |
| Direct Gemini API Nano Banana | Yes, but this is not an OmniRoute token conversion | Google API key or supported Google API credential | Yes | Yes | **Yes; strongest documented native Gemini image API** |
| Groq | Not the image route for this use case | Groq API key | No image generation route for Creozentic’s still inserts | No | Use Groq for Director and Whisper, not image generation |

OmniRoute’s current image registry explicitly lists Antigravity, Gemini Web, ChatGPT Web, and Codex image providers. The source gives Antigravity a special Gemini image transport, Gemini Web a web-session image transport, ChatGPT Web a cookie-based image transport, and Codex a Responses-based hosted image tool [1].

## Antigravity: confirmed answer

**Yes, OmniRoute can route an Antigravity image-capable model for generated still images.** The current source registers `antigravity/gemini-3.1-flash-image` and sends a Cloud Code envelope with a Google project ID and `requestType: "image_gen"` [1] [2].

This is appropriate for Creozentic’s editing workflow because Creozentic needs a prompt-to-image operation such as:

```text
Create a clean visual insert supporting this spoken idea: “...”
```

The current Antigravity image handler builds the request with a text prompt and image configuration. The handler does **not** currently build a general multi-reference image-edit request. Therefore, do not promise that arbitrary uploaded reference images can be edited through the Antigravity route until a live test confirms it.

Antigravity’s own documentation separately describes Nano Banana 2 as an internal generative-image tool used by the agent for UI mockups, web/app images, diagrams, and related tasks [3]. That official product documentation confirms image capability inside Antigravity, but it does not by itself prove that every internal image action is exposed as a general external API. OmniRoute’s adapter is the evidence that the specific `image_gen` route is exposed.

## Gemini Web: confirmed but experimental

**Yes, the current OmniRoute release includes a Gemini Web image-generation route.** Merged PR #10494 adds `gemini-web/nano-banana-web` through `POST /v1/images/generations` [4]. It uses a valid Gemini Web browser session, drives the web executor in image mode, extracts generated image URLs, avoids accidentally returning web-search thumbnails, and supports up to four requested outputs. Each output is a separate web turn that may take approximately 30–60 seconds [4] [5].

This route is useful for prompt-to-image still inserts, but it is less suitable as the primary production provider because it depends on browser-session behavior. The handler can return a successful chat response without an image when the web session refuses, searches instead of generating, reaches a challenge page, or changes its UI behavior. OmniRoute reports those cases, but the route remains more fragile than a documented native image API.

## ChatGPT Web: image generation yes, arbitrary editing limited

**Yes, ChatGPT Web can be used for prompt-to-image through OmniRoute.** It uses a ChatGPT Web session cookie, not an OpenAI Platform API key [6].

However, image editing is not equivalent to the native OpenAI image API. The current OmniRoute implementation uses cached conversation context. An image-edit request works only when the image was recently generated through the same OmniRoute instance, with a limited cache window. It is not a stateless endpoint where Creozentic can send any arbitrary uploaded image and reliably receive an edit [7].

For your current uploaded-video editor, this limitation is not fatal because the editor’s intended operation is to generate new still inserts from prompts. It becomes important only if you later want to upload a reference product image and ask ChatGPT Web to preserve and modify it.

## Codex: strongest OmniRoute route for reference-image editing

**Yes, Codex is exposed as an image-capable route, and its implementation is more suitable for reference-image editing.** OmniRoute translates the request into the `/v1/responses` endpoint with the hosted `image_generation` tool. When reference images are provided, it sets the hosted tool action to `edit` and sends each reference as an `input_image` item [1] [8].

Codex still requires a valid Codex/ChatGPT OAuth connection. It is not a free conversion of a normal OpenAI API key, and it is not the same thing as a ChatGPT Web cookie. It also remains subject to the connected account’s entitlements, quota, session validity, and provider terms.

## What the community videos prove—and what they do not prove

The public OmniRoute and Antigravity videos reviewed are primarily setup demonstrations. They show people connecting Antigravity, Cline, Kilo Code, or another coding client to an OpenAI-compatible OmniRoute base URL and local API key [9] [10] [11]. This supports the conclusion that OmniRoute is useful as a local compatibility gateway for chat and coding models.

Those videos do **not** establish that every model visible through the gateway supports image generation, that Antigravity tokens become general API keys, or that ChatGPT Web and Antigravity image routes are stable production APIs. The merged pull request, provider registry, handler source, and actual image request are stronger evidence for media capability than a coding-focused tutorial.

Community reports also show the importance of release version. OmniRoute’s Antigravity image route previously failed with an insufficient-authentication-scope error. The issue states that the route was reworked to use the Cloud Code project envelope and was later fixed through OAuth scope refresh logic [12]. This means users should run the current release, reconnect OAuth if scopes or project metadata are stale, and test the exact model instead of relying on an older tutorial.

## Native Gemini API versus Antigravity through OmniRoute

Google’s native Gemini image API documents Nano Banana image models with text-to-image, multi-turn editing, reference images, 9:16 output, high-resolution generation, and professional image production capabilities [13]. This is the cleanest documented route if you can obtain and use a Google API credential.

Antigravity through OmniRoute is attractive when you already have an eligible Antigravity account and want to use its quota, but it is a compatibility route over a Cloud Code backend rather than the same public Gemini API contract. Therefore:

| Requirement | Native Gemini image API | Antigravity through OmniRoute |
|---|---:|---:|
| Documented image-generation API | Yes | OmniRoute adapter documents a compatible route |
| Prompt-to-image | Yes | Yes |
| 9:16 image output | Documented by Gemini image models | Adapter normalizes aspect ratio; live model test required |
| Multiple reference images | Documented for Gemini 3 image models | Not exposed by the current Antigravity handler shown in source |
| Multi-turn image editing | Documented | Not confirmed through the Antigravity image handler |
| Stable API-key authentication | Yes, with Google API credentials | No; uses OAuth/session/project configuration |
| Shared Antigravity quota | No | Yes, shared with Antigravity/`agy` account routes |
| Production stability | Higher | More dependent on OmniRoute release and Google Cloud Code behavior |

## Recommended route for Creozentic

For the uploaded-video editing workflow, use the following routing policy:

```text
Director and transcript:
Groq GPT-OSS 120B + Groq Whisper Large V3 Turbo

Generated still inserts:
Primary: verified Antigravity image route or native Gemini image API
Fallback: Codex image route if reference-image editing is needed
Secondary experimental fallback: Gemini Web Nano Banana

Video editing:
FFmpeg / Remotion / Motion Canvas

AI-generated moving video:
Separate provider boundary; do not include it in the first editing test
```

The first test should generate one or two still inserts from prompts only. Test this exact contract through OmniRoute:

```http
POST http://localhost:20128/v1/images/generations
Authorization: Bearer <local-omniroute-key>
Content-Type: application/json
```

Use a model name explicitly returned by the live OmniRoute model catalog. Do not hard-code a model solely from a YouTube tutorial. Confirm that the response contains an image URL or base64 image payload, then let Creozentic persist it as a generated Asset and insert it into the uploaded-video timeline.

For reference-image editing, use a separate test with Codex or the native Gemini API. Do not assume Antigravity or Gemini Web will accept arbitrary reference images merely because their consumer products can edit images interactively.

## Final yes/no answers

| Question | Answer |
|---|---|
| Can OmniRoute give Creozentic a usable local API endpoint? | **Yes.** |
| Does the local OmniRoute key become an OpenAI or Google API key? | **No.** |
| Can OmniRoute use ChatGPT Web for prompt-to-image? | **Yes, through a ChatGPT Web session cookie.** |
| Can ChatGPT Web reliably edit any arbitrary uploaded reference image? | **No; current edit behavior is stateful and cache-dependent.** |
| Can OmniRoute use Antigravity for prompt-to-image? | **Yes, through the Antigravity/Cloud Code image route.** |
| Can Antigravity’s current OmniRoute handler be assumed to support arbitrary reference-image editing? | **No.** |
| Can OmniRoute use Gemini Web for prompt-to-image? | **Yes in the merged v3.8.50 path, but treat it as experimental.** |
| Can OmniRoute use Codex for prompt-to-image? | **Yes.** |
| Can Codex through OmniRoute accept reference images for edits? | **Yes, according to the current handler implementation.** |
| Can Groq provide the required image model for this workflow? | **No; use Groq for the Director and transcription, not still-image generation.** |
| Do you need an AI video model for editing your uploaded video? | **No.** |
| Do you need an image model for your editor’s generated still inserts? | **Yes.** |

## Security and account limitations

ChatGPT cookies, Gemini Web cookies, Antigravity OAuth refresh tokens, Codex OAuth credentials, project IDs, and local OmniRoute keys are account credentials. Keep them server-side, encrypted, and outside GitHub. Do not expose them in the browser or send them to a third-party hosted router.

The connected account’s quota remains the connected account’s quota. OmniRoute does not create unlimited entitlement. Using both `antigravity` and `agy` against one Google account shares the same Antigravity backend quota; it does not multiply the allowance [2]. Consumer subscription and web-session automation may also have provider-specific usage and terms restrictions.

## Conclusion

For Creozentic, the answer is **yes, OmniRoute can supply the image model needed for uploaded-video editing**, especially through the Antigravity and Codex routes. The safest interpretation is:

```text
OmniRoute can expose the model route.
OmniRoute cannot transform the upstream credential into a universal API key.
Antigravity is confirmed for prompt-to-image.
Codex is strongest for reference-image editing.
Gemini Web and ChatGPT Web are usable but more session-dependent.
Groq remains the Director/transcription route, not the image route.
```

Start with a one-image prompt-to-image test through `antigravity/gemini-3.1-flash-image` or the exact image model shown by the live OmniRoute catalog. Keep a native Gemini API or Codex route as the fallback for cases requiring reference-image editing or more predictable multimodal behavior.

## References

[1]: https://github.com/diegosouzapw/OmniRoute/wiki/Provider-Reference "OmniRoute Provider Reference"
[2]: https://github.com/diegosouzapw/OmniRoute/blob/release/v3.8.50/docs/guides/ANTIGRAVITY-ONBOARDING.md "OmniRoute Antigravity Onboarding"
[3]: https://antigravity.google/docs/models "Google Antigravity Models"
[4]: https://github.com/diegosouzapw/OmniRoute/pull/10494 "Merged Gemini Web Image Generation Pull Request"
[5]: https://github.com/diegosouzapw/OmniRoute/blob/release/v3.8.50/docs/providers/CHATGPT_WEB.md "OmniRoute ChatGPT Web Provider Guide"
[6]: https://github.com/diegosouzapw/OmniRoute/blob/release/v3.8.50/docs/providers/CHATGPT_WEB.md "OmniRoute ChatGPT Web Credentials"
[7]: https://github.com/diegosouzapw/OmniRoute/issues/10466 "Gemini Web Image Generation Issue and Acceptance Criteria"
[8]: https://github.com/diegosouzapw/OmniRoute/issues/2334 "Antigravity Image Authentication Issue"
[9]: https://www.youtube.com/watch?v=ud0d_unFHVM "FREE Unlimited AI for Coding: Antigravity + OmniRoute Setup"
[10]: https://www.youtube.com/watch?v=T5UwB1MgKFQ "OmniRoute + Antigravity Setup"
[11]: https://www.youtube.com/watch?v=UpzUAdn9ltA "Antigravity + OmniRoute: Get FREE Unlimited AI Access"
[12]: https://github.com/diegosouzapw/OmniRoute/issues/2334 "Antigravity Image Scope Fix Discussion"
[13]: https://ai.google.dev/gemini-api/docs/image-generation "Google Gemini Image Generation Documentation"
