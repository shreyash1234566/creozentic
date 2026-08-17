import { useEffect, useMemo, useState } from "react";
import { Btn, PageHeader, Panel } from "../ui";
import { useStore } from "../store";
import { uid } from "../domain";
import {
  analyzeEditorProject,
  createEditorProject,
  editorAction,
  getEditorProject,
  getServerAssets,
  planEditorProject,
  type EditorProject,
} from "../client/api";

type Workspace = "brief" | "storyboard" | "visuals" | "timeline" | "quality";
const tabs: Array<[Workspace, string]> = [
  ["brief", "Director Brief"],
  ["storyboard", "Storyboard"],
  ["visuals", "B-roll & Graphics"],
  ["timeline", "Timeline & Render"],
  ["quality", "Quality & Iteration"],
];
const demoBeats = [
  ["00:00–00:03", "Hook", "A clear promise grounded in the approved brief."],
  ["00:03–00:07", "Proof", "Verified source footage and evidence-led narration."],
  ["00:07–00:12", "Payoff", "Show the product solving the audience problem."],
  ["00:12–00:15", "CTA", "A platform-safe next step with deterministic captions."],
];

export default function Editor() {
  const { backendEnabled, brand } = useStore();
  const [tab, setTab] = useState<Workspace>("brief");
  const [project, setProject] = useState<EditorProject | null>(null);
  const [assets, setAssets] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [brief, setBrief] = useState({
    name: `${brand.name} · Director edit`,
    objective: "Turn verified product evidence into a 15-second vertical edit",
    audience: brand.audience,
    platform: "Instagram Reels",
  });

  useEffect(() => {
    if (!backendEnabled) return;
    void getServerAssets()
      .then(setAssets)
      .catch(() => setAssets([]));
  }, [backendEnabled]);

  const sourceAssets = useMemo(
    () => assets.filter((asset) => String(asset.mimeType ?? "").startsWith("video/")),
    [assets],
  );
  const run = async (operation: () => Promise<Record<string, unknown>>) => {
    setBusy(true);
    setError("");
    try {
      const result = await operation();
      setProject(
        (current) => ({ ...(current ?? {}), ...(result as EditorProject) }) as EditorProject,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Editor action failed.");
    } finally {
      setBusy(false);
    }
  };
  const create = () =>
    run(async () => {
      const created = await createEditorProject({
        ...brief,
        idempotencyKey: uid("editor-project"),
      });
      setProject(created);
      return created;
    });
  const projectId = project?.id ?? "";

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="P3 · Evidence-led editing"
        title="AI Video Editor"
        desc="A separate raw-footage workflow for evidence, structured EditPlans, scoped repair, and quality gates. Product UGC remains in UGC Ad Studio."
        right={
          <span className="rounded-full border border-line px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em]">
            {project?.state ?? "DRAFT"}
          </span>
        }
      />
      <div className="flex flex-wrap gap-2 border-b border-line pb-3">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`rounded-full px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] ${tab === id ? "bg-ink text-paper" : "border border-line text-ink-soft"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </div>
      )}
      {!project && (
        <Panel title="Start with a director brief">
          <div className="grid gap-4 md:grid-cols-2">
            {(["name", "objective", "audience", "platform"] as const).map((field) => (
              <label key={field} className="space-y-1">
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">
                  {field}
                </span>
                <input
                  value={brief[field]}
                  onChange={(event) => setBrief({ ...brief, [field]: event.target.value })}
                  className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm"
                />
              </label>
            ))}
          </div>
          <div className="mt-5 flex items-center gap-3">
            <Btn onClick={create} disabled={busy || !backendEnabled}>
              {backendEnabled
                ? "Create editor project"
                : "Backend required for project persistence"}
            </Btn>
            <span className="text-xs text-ink-soft">
              The director will prefer verified media before generated inserts.
            </span>
          </div>
        </Panel>
      )}
      {project && tab === "brief" && (
        <Panel title="Director Brief">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <div className="label">Objective</div>
              <p className="mt-1 text-sm">{brief.objective}</p>
            </div>
            <div>
              <div className="label">Audience</div>
              <p className="mt-1 text-sm">{brief.audience}</p>
            </div>
            <div>
              <div className="label">Platform</div>
              <p className="mt-1 text-sm">{brief.platform}</p>
            </div>
          </div>
          <div className="mt-6 rounded-xl bg-paper-deep p-4 text-sm">
            <strong>Director contract.</strong> Cite evidence for factual decisions, respect brand
            memory and locked hooks, preserve approved beats during repair, and return structured
            plans rather than render commands.
          </div>
          <div className="mt-5 flex gap-2">
            <Btn
              onClick={() =>
                run(() =>
                  analyzeEditorProject(
                    projectId,
                    sourceAssets.map((asset) => String(asset.id)),
                  ),
                )
              }
              disabled={busy}
            >
              {busy ? "Analyzing…" : "Analyze evidence"}
            </Btn>
            <Btn
              variant="line"
              onClick={() => run(() => planEditorProject(projectId))}
              disabled={busy}
            >
              Create EditPlan v1
            </Btn>
          </div>
        </Panel>
      )}
      {project && tab === "storyboard" && (
        <Panel title="Storyboard">
          <div className="space-y-3">
            {demoBeats.map(([time, label, copy]) => (
              <div
                key={label}
                className="grid gap-3 rounded-xl border border-line p-4 md:grid-cols-[110px_100px_1fr_auto] md:items-center"
              >
                <span className="font-mono text-xs text-ink-soft">{time}</span>
                <span className="font-semibold">{label}</span>
                <span className="text-sm text-ink-soft">{copy}</span>
                <span className="rounded-full bg-leaf/10 px-2 py-1 font-mono text-[9px] uppercase text-leaf">
                  evidence pending
                </span>
              </div>
            ))}
          </div>
          <div className="mt-5 flex gap-2">
            <Btn
              onClick={() => run(() => editorAction(projectId, "hook-lock", { hookId: "pending" }))}
            >
              Lock selected hook
            </Btn>
            <Btn
              variant="line"
              onClick={() => run(() => editorAction(projectId, "storyboard/approve"))}
            >
              Approve storyboard
            </Btn>
          </div>
        </Panel>
      )}
      {project && tab === "visuals" && (
        <Panel title="B-roll & Graphics">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl bg-paper-deep p-4">
              <div className="label">Source strategy</div>
              <p className="mt-2 text-sm">
                Verified product macro, then controlled motion graphic, then generated fallback.
              </p>
            </div>
            <div className="rounded-xl bg-paper-deep p-4">
              <div className="label">Factuality</div>
              <p className="mt-2 text-sm">
                Unverified generated imagery cannot carry factual product text.
              </p>
            </div>
            <div className="rounded-xl bg-paper-deep p-4">
              <div className="label">Approval</div>
              <p className="mt-2 text-sm">Every visual insert must be approved before render.</p>
            </div>
          </div>
          <div className="mt-5 text-sm text-ink-soft">
            {sourceAssets.length
              ? `${sourceAssets.length} verified video asset(s) available.`
              : "Upload a verified source video in Library to populate evidence slots."}
          </div>
        </Panel>
      )}
      {project && tab === "timeline" && (
        <Panel title="Timeline & Render">
          <div className="rounded-xl border border-line p-5">
            <div className="flex items-center justify-between">
              <span className="font-display text-2xl">15.0s</span>
              <span className="font-mono text-[10px] uppercase text-ink-soft">
                FFmpeg pipeline · QA v1
              </span>
            </div>
            <div className="mt-5 grid grid-cols-4 gap-1">
              {demoBeats.map(([time, label]) => (
                <div key={label} className="rounded-md bg-indigo/15 p-3">
                  <div className="font-mono text-[9px] text-indigo">{time}</div>
                  <div className="mt-2 text-sm font-semibold">{label}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-5 flex gap-2">
            <Btn onClick={() => run(() => editorAction(projectId, "render"))}>Queue render</Btn>
            <Btn variant="line" onClick={() => setTab("quality")}>
              Open quality gate
            </Btn>
          </div>
        </Panel>
      )}
      {project && tab === "quality" && (
        <Panel title="Quality & Iteration">
          <div className="grid gap-3 md:grid-cols-3">
            {[
              ["Structural", "PASS"],
              ["Product facts", "REVIEW"],
              ["Platform spec", "PASS"],
            ].map(([label, verdict]) => (
              <div key={label} className="rounded-xl border border-line p-4">
                <div className="label">{label}</div>
                <div
                  className={`mt-3 font-display text-xl ${verdict === "REVIEW" ? "text-saffron-deep" : "text-leaf"}`}
                >
                  {verdict}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-xl bg-marigold/10 p-4 text-sm">
            A high-severity factual or rights issue overrides a cosmetic pass. Automatic repair is
            limited to two attempts and must preserve approved beats.
          </div>
          <div className="mt-5 flex gap-2">
            <Btn
              onClick={() => run(() => editorAction(projectId, "evaluate", { renderId: "latest" }))}
            >
              Evaluate render
            </Btn>
            <Btn
              variant="line"
              onClick={() =>
                run(() =>
                  editorAction(projectId, "repair", {
                    scope: ["beat-2"],
                    preserve: ["hook", "captions"],
                    reason: "Product evidence needs a verified macro shot",
                    fixStrategy: "Replace only the visual insert",
                  }),
                )
              }
            >
              Request scoped repair
            </Btn>
          </div>
        </Panel>
      )}
    </div>
  );
}
