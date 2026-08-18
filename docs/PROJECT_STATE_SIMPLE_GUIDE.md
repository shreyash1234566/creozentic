# Creozentic: The Project Explained Simply

## 1. The one-sentence explanation

Creozentic is a **multi-tenant AI content factory**. A customer gives it raw video, a product, a brand, or a written brief. Creozentic studies the material, creates a safe editing plan, generates or selects supporting visuals, renders a video, checks the result, asks for approval when needed, and can prepare the approved result for social publishing.

A simple way to imagine it is:

> **Creozentic is a careful film director, an editing room, a quality inspector, and a publishing assistant living in one platform.**

It is not designed as a dangerous “type one sentence and hope the AI makes something correct” tool. The important rule is that the AI first creates a **plan**, and a controlled renderer creates the actual video from that plan.

## 2. What the user sees

The frontend is an operating desk. The design is intentionally quiet and structured: paper-like backgrounds, dark ink text, saffron actions, clear status labels, cards, panels, and a left navigation system.

| Frontend place | What a person does there |
|---|---|
| Home | See workspace health, credits, recent work, and current status |
| Library | Upload and inspect source media, product assets, and evidence |
| Brand Brain | Store brand voice, colors, references, rules, and approved memory |
| Create / Campaigns | Describe the content goal, audience, offer, product, and channels |
| Daily Content Desk | Plan and run a day’s content schedule |
| AI Video Editor | Turn raw footage into a controlled edit plan and rendered video |
| UGC Ad Studio | Build product-focused UGC-style advertising workflows |
| Catalogue Preflight | Import and validate product catalogue data |
| Storyboard / Review Room | Approve hooks, storyboards, visuals, comments, and decisions |
| Timeline & Render | Queue and inspect deterministic rendering |
| Quality & Iteration | See issues, repair only the broken part, or approve the result |
| Calendar & Publish | Prepare schedules, channel connections, and publishing jobs |
| Results | Inspect performance, comparisons, and recommendations |
| Automation | Inspect workflow runs, notifications, webhooks, and failures |
| Platform Services | See provider and infrastructure activation boundaries |
| System Map | See which backend capability belongs to which frontend surface |
| Admin control plane | Inspect tenant operations, health, audit, billing, and deployment concerns |

The frontend does not replace the existing visual language. New surfaces use the same design primitives and the existing shell.

## 3. The big picture

```text
                         CREOZENTIC
                              |
        +---------------------+---------------------+
        |                                           |
  CREATIVE WORKFLOWS                         RAW VIDEO EDITOR
  briefs, products, UGC                       evidence-first editing
        |                                           |
        +---------------------+---------------------+
                              |
                    SHARED CONTROL PLANE
       tenants · auth · brand · products · rights · credits
       queues · storage · AI gateways · QA · approvals
                              |
        +---------------------+---------------------+
        |                                           |
   WORKERS AND ENGINES                       OUTPUTS AND LEARNING
   FFmpeg · Python · OSS                     exports · publishing
   GPU/provider boundaries                    performance feedback
```

The main application is a **Next.js web application** with a typed server layer and a PostgreSQL/Prisma data model. There are also workspace packages for authentication, social publishing, platform integrations, video engines, workers, configuration, queue contracts, storage, AI routing, analytics, billing, strategy, security, events, feature flags, and the design system.

## 4. The most important idea: truth comes before creativity

Creozentic separates information into two kinds:

| Kind | Meaning |
|---|---|
| Source truth | What was actually uploaded, said, shown, approved, or verified |
| Creative suggestion | A possible hook, transition, caption, B-roll idea, graphic, or CTA |

The AI is allowed to suggest creative ideas. It is **not** allowed to invent a product fact and quietly present it as true.

For example, if a product video proves that a bottle is blue, the system can use that evidence. If no source proves that the bottle is waterproof, the system must not write “waterproof” as if it were a fact. It may ask for proof, mark the claim for review, or use a non-factual metaphor that does not make the claim.

## 5. Core workflow A: editing an existing video

This is the main **AI Video Editor** workflow.

```text
1. Create project
        |
2. Add raw videos and references
        |
3. Analyze media
        |
4. Save evidence
   transcript · words · shots · audio · OCR · entities · safe regions
        |
5. Build memory bundle
   brand memory · project memory · editing memory · learning context
        |
6. Director creates versioned EditPlan
   hook · story beats · EDL · B-roll · captions · audio · motion graphics
        |
7. Human locks the hook
        |
8. Human approves storyboard and visual inserts
        |
9. Renderer creates video
   FFmpeg / Motion Canvas / OTIO boundaries
        |
10. QA judges inspect the result
    structure · facts · rights · captions · audio · platform · motion
        |
11. Repair only the broken part, or request review
        |
12. Human approves final output
        |
13. Export and optionally publish
```

### Step 1: Create the project

The user enters a name, objective, audience, and target platform. The editor creates an `EditorProject`. The project belongs to a workspace, so one customer cannot accidentally see another customer’s project.

The project begins in a draft state. It does not immediately render anything.

### Step 2: Analyze the source media

The user selects uploaded video assets. The analysis worker can use local tools such as `ffprobe` and FFmpeg to learn technical facts: duration, dimensions, streams, frame rate, audio presence, and basic audio windows.

The evidence contract can also hold richer provider results:

| Evidence | Simple meaning |
|---|---|
| Transcript words | The exact words and their times |
| Shot boundaries | Where one camera shot changes to another |
| Audio windows | Loudness, silence, clipping, and other time windows |
| Detected entities | People, products, logos, or objects found in frames |
| OCR regions | Text found inside frames and its location |
| Safe regions | Areas where captions or graphics may be placed safely |
| Source asset record | Which uploaded file produced the evidence |

The evidence is saved in the database instead of being kept only in the AI’s temporary memory.

### Step 3: Build the memory bundle

The editor uses controlled memory. The important memory layers are:

| Memory layer | Example |
|---|---|
| Brand memory | “Use calm language and never use neon colors.” |
| Project memory | “This edit is for a 15-second Instagram Reel.” |
| Editing memory | “The approved hook must not be changed during repair.” |
| Learning memory | “Short proof-led openings performed better last month.” |

Memory is context. It is not permission to invent facts.

### Step 4: The Director creates an EditPlan

The Director is the planning brain. It returns structured data, not random FFmpeg commands.

A typical plan contains:

| Plan part | What it controls |
|---|---|
| Hook candidates | Several possible openings with reasons and evidence references |
| Narrative map | Hook → problem → proof → payoff → CTA |
| Beats | Exact time ranges and editorial purpose |
| Edit Decision List | Keep, cut, caption, transition, audio, and source decisions |
| B-roll strategy | Verified source first, deterministic graphic next, approved fallback after that |
| Caption plan | Text, timing, emphasis, safe zones, and face avoidance |
| Audio plan | Voice preservation, music ducking, beat sync, attack/release, clipping target |
| Motion graphics | Kinetic captions, proof callouts, CTA cards, bounded movement |
| Visual Bible | Palette, typography, composition, motion intensity, forbidden treatments |
| Render manifest | Source checksums, renderer version, prompt versions, output formats |

The current deterministic example uses five beats:

```text
Hook   00:00–00:03
Problem 00:03–00:07
Proof   00:07–00:11
Payoff  00:11–00:15
CTA     00:15–00:18
```

The actual project can use different durations; these are the safe planning defaults in the current local planner.

### Step 5: Human checkpoints

The user can lock the hook. Once locked, a later repair must preserve it. The user can then approve the storyboard and visual inserts. This prevents a later AI call from silently replacing the creative direction.

### Step 6: Build the timeline

The local runtime now creates an evidence-linked EDL and an OTIO-style timeline. In simple language, it creates a list that says:

```text
Keep this source range.
Put this caption here.
Use this transition here.
Lower music while speech is present.
Attach these evidence IDs.
Do not change the approved hook.
```

The render manifest records how the result was made. This is important because the same plan should be reproducible later.

### Step 7: Render

The deterministic local renderer uses FFmpeg for the baseline render. It can scale and pad video into a vertical canvas, map video and audio streams, encode H.264/AAC, and produce fast-start MP4 output.

The renderer is intentionally separate from the Director. The Director decides **what should happen**. The renderer decides **how to execute the approved plan**.

### Step 8: QA

Quality checks are separate judges. A failure in one area does not automatically destroy the entire project.

| Judge | Question |
|---|---|
| Structural | Is the video the right duration and format? |
| Product/factual | Did the video make an unsupported claim? |
| Rights | Are footage, music, images, logos, and talent cleared? |
| Caption | Are captions readable, timed, and inside safe zones? |
| Audio | Is speech understandable and free from clipping? |
| Motion | Is movement bounded and not distracting? |
| Platform | Does the file satisfy the target platform specification? |
| Visual | Does the output match the approved visual plan? |

A high-severity factual, rights, or safety problem beats a cosmetic pass.

### Step 9: Scoped repair

If one part is wrong, the system should repair only that part. For example:

```text
Problem: the proof insert is not verified.
Preserve: hook, captions, audio, CTA.
Repair: replace only the proof visual.
```

The current runtime has preserve/fix scopes, bounded repair attempts, replacement decisions, and tests for this behavior.

### Step 10: Final approval

A human reviewer approves the final render. Only then should it be treated as ready for export or publishing.

## 6. Core workflow B: creating a new video from a brief

The broader creative-production path starts with a structured brief instead of existing raw footage.

```text
Brief
  ↓
Quote and credit reservation
  ↓
Brand/product/rights preflight
  ↓
Versioned workflow graph
  ↓
Queue typed jobs
  ↓
Generate or retrieve assets
  ↓
Compose deterministic output
  ↓
Run QA and Creative Passport checks
  ↓
Human review
  ↓
Export
  ↓
Publish when channel and approval rules pass
```

### What the brief contains

A brief may describe the objective, audience, product, offer, legal copy, platforms, content type, brand, references, and output formats.

The system snapshots important inputs. This means a later brand change cannot secretly rewrite an older run’s history.

### Quotes and credits

Before expensive work begins, the system can estimate required credits. It reserves credits for the requested output formats. When the run succeeds, usage settles. When it fails or is cancelled, the system can release or reconcile the reservation according to the workflow rules.

This is similar to reserving a table at a restaurant: the system holds capacity first, then confirms the final bill after the meal is served.

### Workflow graph

A creative run is made from typed nodes, not a pile of untracked function calls.

```text
Input validation
      ↓
Brand/product preflight
      ↓
Asset selection or generation
      ↓
Composition
      ↓
QA
      ↓
Review
      ↓
Export / publish
```

The graph has idempotency keys, retry rules, state transitions, audit events, outbox events, and dead-letter handling.

## 7. Core workflow C: long-form video to short-form clips

The repurposing engine takes longer footage and finds useful short moments.

```text
Long video
  ↓
Transcript and shot evidence
  ↓
Candidate moments
  ↓
Score each moment for objective and evidence
  ↓
Create vertical-pack candidates
  ↓
Add captions, safe zones, B-roll, and CTA
  ↓
Human selects candidates
  ↓
Render approved clips
```

The local candidate scorer considers the objective, transcript match, and evidence score. It ranks candidates deterministically. Provider-backed generation and real source footage remain external activation points.

## 8. Core workflow D: social publishing

Publishing is deliberately later than creation.

```text
Approved output
  ↓
Platform validation
  ↓
Channel identity and OAuth check
  ↓
Create upload/container job
  ↓
Upload media
  ↓
Poll provider if necessary
  ↓
Publish
  ↓
Save remote ID and receipt
```

The social package contains provider policies for Meta, TikTok, YouTube, and LinkedIn. It checks caption length, accepted media types, container requirements, idempotency, and polling behavior.

The code can prepare this process, but actual publishing needs platform developer apps, OAuth tokens, scopes, app reviews, and connected user accounts.

## 9. Core workflow E: daily autonomy

Daily autonomy means the system can prepare content on a schedule, but it does not mean “publish anything without rules.”

```text
Schedule tick
  ↓
Read autonomy policy
  ↓
Check brand and product truth
  ↓
Choose eligible content types
  ↓
Create plan and estimate cost
  ↓
Queue work
  ↓
Require approval when policy says so
  ↓
Publish only when all gates pass
```

The platform stores autonomy policies, approval modes, escalation rules, and missing-input states. A missing product fact, expired claim, missing consent, or unavailable channel should stop or escalate the run.

## 10. Where the open-source projects fit

The open-source projects are not allowed to become the owner of Creozentic’s business truth. They are bounded helpers.

| Engine family | Job inside Creozentic |
|---|---|
| AVE / VideoAgent | Director and editing research references |
| OpenShorts | Short-form repurposing reference |
| Pixeltable | Media/data pipeline reference |
| ViMax | Heavy video generation reference |
| OpenChatCut | Raw-footage editing reference |
| OpenMontage | Montage and composition reference |
| Twick | Node-based motion composition reference |
| ComfyUI | Image/video generation graph reference |
| Remotion / Motion Canvas | Deterministic graphics and scene composition |
| FFmpeg / ffprobe | Local technical analysis and deterministic render primitive |
| Temporal | Durable workflow execution option |

The current manifest contains **12 core engine boundaries** and **6 supporting platform boundaries**. Each adopted engine has a role, source provenance, pinned revision, license note, entrypoint, activation flag, and external requirement. The worker refuses to run an engine unless its environment flag is enabled.

In child-friendly language:

> **Creozentic owns the rulebook. The open-source projects are specialist tools in the toolbox. No tool is allowed to rewrite the rulebook.**

## 11. The worker system

Heavy work should not block the web page.

```text
Browser asks for work
        ↓
API creates a job
        ↓
Queue stores the job
        ↓
Worker takes the job
        ↓
Python / FFmpeg / adopted engine runs
        ↓
Worker saves evidence or output
        ↓
API reports status to frontend
```

The worker supports local media analysis, adopted engine dispatch, and disabled-by-default heavy engines. Redis, Pub/Sub, Temporal, GPU hosts, and real provider endpoints are external deployment choices.

## 12. Important database ideas

The database is the platform’s memory and history book.

| Record type | What it remembers |
|---|---|
| Workspace | Which customer owns the work |
| Membership | Who can do what |
| Asset | Which file was uploaded |
| Media evidence | What was found in the file |
| Editor project | The editing job |
| Edit plan version | Every version of the Director’s plan |
| Hook candidate | Possible openings and evidence |
| Edit beat | Timed story sections |
| Visual insert | B-roll and graphic slots |
| Motion graphic | Parameterized graphic instructions |
| Audio/caption plan | Sound and text instructions |
| Render | Which output was created |
| Evaluation | What QA judges found |
| Iteration | What was repaired and preserved |
| Approval | Who accepted what and when |
| Memory snapshot | Context used for a project |
| Skill execution | Which structured editor skill ran |
| Workflow run | A broader creative production job |
| Ledger entry | Credits reserved, spent, or released |
| Publish job | Social delivery attempt and receipt |
| Audit event | A history of important actions |

The database is not just storage. It helps make the system reproducible, explainable, tenant-safe, and recoverable.

## 13. Security and safety in simple language

Creozentic has several locks:

| Lock | What it prevents |
|---|---|
| Workspace scope | Customer A reading customer B’s records |
| Role policy | A viewer publishing or changing billing |
| Idempotency key | The same request charging or publishing twice |
| Evidence requirement | Unsupported product claims being treated as facts |
| Rights and consent checks | Using media without permission |
| Approval states | Publishing an unreviewed output |
| Retry limits | Endless expensive loops |
| Dead-letter records | Failed jobs disappearing silently |
| Render manifest | Outputs becoming impossible to reproduce |
| Audit events | Important changes becoming invisible |
| Tenant-safe object keys | Files crossing workspace boundaries |
| Webhook signatures | Fake external events being accepted |

## 14. Current project status

The project is in a **code-complete architecture and locally verified integration state**. The repository has been pushed to the selected GitHub repository, and the final local commit is:

```text
cefa636 Finish local Part II implementation and classify externals
```

The GitHub workflow file was deliberately left at the remote version because the available GitHub token could not update workflow files. The verified workflow file is separate and must be pasted into GitHub manually.

| Area | Current state |
|---|---|
| Frontend shell and design system | Implemented and preserved |
| Backend API surface | Implemented across the main product domains |
| Editor lifecycle | Implemented with evidence, plans, approvals, renders, QA, and repairs |
| Local EDL/OTIO/render contracts | Implemented and tested |
| Local FFmpeg baseline | Implemented |
| Worker dispatch | Implemented with safe disabled-by-default engine flags |
| OSS provenance | Implemented for 12 core and 6 supporting boundaries |
| Admin route | Implemented |
| OpenAPI route coverage | Generated for 151 API paths |
| Unit and contract tests | Passed: 29 tests in the final pass |
| Browser E2E | Passed for Studio, System Map, and Admin |
| Guide completeness | Passed: 13/13 |
| OSS completeness | Passed: 12 core + 6 supporting |
| Prisma validation | Passed |
| Production build | Passed |

## 15. What External means

External does not mean “forgotten.” It means the code is prepared, but the sandbox cannot own the required real-world resource.

| External item | What is needed |
|---|---|
| AI Director | Gemini/OpenAI/Claude account, key, model access, budget, policy, acceptance dataset |
| Transcript | Deepgram or another speech provider account and key |
| Deep evidence | GPU or capable media worker, model weights, OCR/CV licenses, storage |
| Social publishing | Meta/TikTok/YouTube/LinkedIn developer apps, OAuth, scopes, approval |
| Storage | Cloudflare R2 or S3 account, bucket, credentials, lifecycle policy |
| Queues | Redis, Pub/Sub, or Temporal deployment and credentials |
| Database | Production Postgres/pgvector, backups, pooling, network policy |
| Billing | Stripe/Lago account, price IDs, webhooks, merchant decisions |
| Auth | Domains, OAuth apps, passkey origins, email delivery, session secrets |
| GPU rendering | RunPod or another GPU provider, images, weights, budget, licenses |
| Benchmarking | Real licensed agency footage, labels, expected outputs, reviewer time |
| Legal approval | OSS, model, font, music, stock, and media license decisions |
| Human approval | People authorized to approve hooks, storyboard, visuals, rights, and final outputs |

## 16. The simplest story of a successful video

```text
You give Creozentic footage and a goal.

Creozentic asks: “What is actually true in this footage?”

It writes the truth into evidence records.

The Director says: “Here is a safe story plan.”

You lock the important creative choices.

The renderer follows the plan.

The inspectors check the video.

If one part is wrong, Creozentic repairs only that part.

You approve the finished video.

Creozentic exports it and, after external channel setup, publishes it.

Performance data helps the next plan become better.
```

That is the core of Creozentic: **truth first, creative plan second, controlled rendering third, inspection fourth, approval before publishing, and learning afterward.**
