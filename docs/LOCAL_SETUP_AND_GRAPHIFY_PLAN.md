# Creozentic Local Setup and Graphify Plan

## Goal

After following this plan, the local computer will contain the Creozentic application, the exact 16 original worker repositories, the Graphify configuration, and a reproducible way to generate and update the project knowledge graph.

The source code remains the authority. Graphify is an index and visual map; it is not a replacement for the source files.

## 1. What the user needs before starting

The local computer should have Git, GitHub CLI or a GitHub account with repository access, Node.js 22 or later, pnpm, Python 3.11 or later, FFmpeg, and enough disk space. The complete cloned source tree currently requires approximately 9 GB, and model weights or uploaded videos require additional space. A practical target is 20–50 GB free storage.

The Graphify map can be generated without a powerful GPU for source-code analysis. A GPU is not required for Graphify. AI media models are a separate requirement for Creozentic’s video-processing workflow.

## 2. Clone Creozentic

Open a terminal and run:

```bash
git clone https://github.com/shreyash1234566/creozentic.git
cd creozentic
pnpm install
```

If the repository is private, sign in to GitHub first using the user’s normal GitHub method. Do not paste passwords or access tokens into source files.

## 3. Obtain the 16 original repositories

The original repositories should be cloned by the project’s reproducible setup script or manifest. They should not be manually copied into TypeScript and they should not be treated as ordinary application source.

Expected local layout:

```text
creozentic/
├── apps/
├── packages/
├── src/
├── docs/
├── scripts/
└── third_party/
    ├── ai-broll/
    ├── ave/
    ├── comfyui/
    ├── cutscript/
    ├── funclip/
    ├── openchatcut/
    ├── openmontage/
    ├── openshorts/
    ├── pixeltable/
    ├── temporal/
    ├── twick/
    ├── videoagent/
    ├── videoclipper/
    ├── videodb-director/
    └── vimax/
```

The exact repository URLs and status are recorded in:

```text
docs/SOURCE_FIRST_REPOSITORY_INVENTORY.md
docs/SOURCE_FIRST_STATUS_LEDGER.json
docs/graphify-final/batch-manifest.json
```

The setup process must pin each worker to a known commit or tag. This is important because the Graphify map is only accurate for the source revision that was analyzed.

## 4. Install Graphify

Install the official Graphify CLI with its optional SQL and Terraform parsers:

```bash
uv tool install 'graphifyy[openai,sql,terraform]'
```

Confirm it is available:

```bash
graphify --help
graphify global --help
```

For code-only analysis, an external AI key is not required. Documentation and media semantic analysis may require a configured OpenAI-compatible provider and should be enabled only when desired.

## 5. Configure Graphify exclusions

Use the project file:

```text
.graphifyignore
```

It should exclude dependency caches, build output, Git metadata, model weights, uploaded videos, and generated artifacts. It should keep application source, worker source, documentation, SQL, Terraform, schemas, configuration examples, and architecture reports.

Never exclude a source file merely because it is inconvenient to parse. If Graphify cannot parse a file, record the warning in the manifest instead.

## 6. Generate the graph in batches

Do not run one enormous recursive scan over all 16 repositories. It can consume excessive RAM and appear frozen. Use separate batches:

```bash
# Application source
bash scripts/run-graphify-application-batch.sh

# Each normal worker repository
bash scripts/run-graphify-worker-batches.sh

# Large Temporal modules
bash scripts/run-graphify-temporal-batches.sh

# Documentation, schemas, and configuration
bash scripts/run-graphify-documentation-batch.sh
```

If the project contains only the existing helper scripts, use their documented commands or regenerate equivalent scripts from the batch manifest. The important rule is that each batch has its own output and log.

The outputs should be stored below:

```text
docs/graphify-batches/
```

## 7. Merge the graph

After every batch completes, add the generated graphs to Graphify’s global graph using the official merge command:

```bash
graphify global add <batch-output>/graph.json --as <source-name>
```

Repeat the command for every successful batch. Then export the merged graph:

```bash
graphify export callflow-html <output-location>
```

Keep the raw merged graph in a large-file artifact location rather than ordinary Git if it exceeds GitHub’s normal file limit. The repository now also keeps a compressed `graph.json.gz` artifact and a small `graph-overview.json`, while the generated report and manifest remain in Git:

```text
docs/graphify-final/GRAPH_REPORT.md
docs/graphify-final/batch-manifest.json
docs/graphify-final/graph-visual.html
```

The complete uncompressed `graph.json` is ignored by Git and can be regenerated locally or stored with Git LFS/object storage if needed. The compressed `graph.json.gz` is the portable one-clone artifact. `graph_viewer_server.py` automatically loads the raw JSON when it exists locally and otherwise loads the compressed artifact after a fresh clone.

## 8. Open the visual knowledge graph

Run the project’s Graphify viewer server from the final output directory:

```bash
cd docs/graphify-final
python3 graph_viewer_server.py
```

Open the visual page in a browser:

```text
graph-visual.html
```

The whole-project view shows source repositories as connected circles. Selecting a repository and opening it shows actual files/functions/classes and their edges. This progressive view is intentional because attempting to draw 139,909 nodes and 352,997 edges at once can freeze a phone or ordinary browser.

## 9. How to use the graph with Cloud Code

Give Cloud Code these items together:

```text
SOURCE_FIRST_INTEGRATION_PLAN.md
SOURCE_FIRST_STATUS_LEDGER.json
GRAPH_REPORT.md
batch-manifest.json
.graphifyignore
Graphify query instructions
The relevant source repositories or local source checkout
```

Use the graph first to locate relevant files and relationships. Then ask Cloud Code to open and verify the original source files before making changes. The graph reduces broad exploration, but it must not be treated as proof when an edge is marked inferred or when a parser warning exists.

## 10. What happens after a code change

Do not edit `graph.json` by hand. After changing source code:

```text
Change source code
    ↓
Run the relevant Graphify batch again
    ↓
Reuse the Graphify cache where available
    ↓
Merge the refreshed batch graph
    ↓
Regenerate the report and manifest
    ↓
Check for new parse warnings
    ↓
Commit source plus refreshed small artifacts
```

For a small change in the application, rerun the application batch rather than every worker. If a worker repository changes, rerun that worker’s batch. If repository versions change, rerun all affected cross-source batches and record the new commit hashes.

## 11. Verification checklist

The local setup is correct only when all of the following are true:

| Check | Expected result |
|---|---|
| `git status` | No unexpected setup files are missing. |
| `pnpm install` | Completes successfully. |
| `pnpm exec tsc --noEmit` | Passes. |
| Project tests | Pass. |
| Every manifest repository directory | Exists under `third_party/`. |
| Every worker commit | Matches the pinned manifest revision. |
| Graphify batch manifest | Lists every requested repository/corpus. |
| Graphify outputs | Each successful batch has a graph output and log. |
| Global graph | Contains the expected nodes and edges. |
| Visual viewer | Shows repository circles and expands a selected repository. |
| Parse warnings | Are documented; none are silently ignored. |
| Source-first ledger | Matches actual runtime activation, not merely cloning. |

## 12. What should and should not be committed

Commit the Creozentic application source, worker manifest, Graphify ignore file, setup/update scripts, reports, ledgers, and small visual assets.

Do not commit model weights, uploaded media, generated videos, dependency caches, Python virtual environments, or the enormous raw graph into ordinary Git. Use Git LFS, release storage, object storage, or local regeneration for large artifacts.

The safest long-term arrangement is:

```text
GitHub repository:
    application + scripts + manifest + reports + small viewer

Local/CI artifact storage:
    third_party source checkouts + graph.json + model weights + media
```

## Final operating rule

The source repositories and source files are authoritative. The Graphify graph is regenerated from those files. If the source and graph disagree, trust the source, rerun the relevant Graphify batch, and record the new graph generation date and source commit hashes.
