import { useEffect, useState } from "react";
import { PageHeader, Panel, Btn } from "../ui";
import { useStore } from "../store";
import { SAMPLE_IMAGES, img } from "../data";
import type { ReviewTask as PersistedReviewTask } from "../domain";
import ScoreCard, { DIMENSIONS, type ScoreRow, type Verdict } from "./ScoreCard";
import {
  addServerReviewComment,
  createServerReviewLink,
  decideServerReview,
  exportServerRun,
} from "../client/api";

type Comment = { id: string; author: string; text: string; region: string };
type Task = {
  id: string;
  runId?: string;
  title: string;
  brand: string;
  version: string;
  kind: "static" | "video";
  images: string[];
  status: "pending" | "approved" | "rejected";
  verdicts: Record<string, { verdict: Verdict; repair?: string }>;
  comments: Comment[];
  requiredRoles: string[];
};

const SEED_TASKS: Task[] = [
  {
    id: "t1",
    title: "Monsoon Sale — sofa pack",
    brand: "Kosmic Furniture",
    version: "run #1042 · brand v7 · wf catalog-to-creative.v1",
    kind: "static",
    images: SAMPLE_IMAGES.slice(0, 4),
    status: "pending",
    verdicts: {
      "Product / identity truth": { verdict: "pass" },
      "Brand rules & typography": { verdict: "pass" },
      "Message / claim correctness": { verdict: "pass" },
      "Composition & platform fit": {
        verdict: "warn",
        repair: "CTA sits inside the 9:16 caption zone",
      },
      "Distinctiveness / authenticity": { verdict: "pass" },
      "Technical export / rights": { verdict: "pass" },
    },
    comments: [
      {
        id: "c1",
        author: "Priya Nair",
        text: "Hook line thoda short karo — Hinglish version.",
        region: "headline",
      },
    ],
    requiredRoles: ["Editor", "Reviewer"],
  },
  {
    id: "t2",
    title: "Diwali reel — dining set",
    brand: "Kosmic Furniture",
    version: "run #1043 · brand v7 · authentic-edit.v1",
    kind: "video",
    images: SAMPLE_IMAGES.slice(2, 6),
    status: "pending",
    verdicts: {
      "Product / identity truth": { verdict: "pass" },
      "Brand rules & typography": { verdict: "pass" },
      "Message / claim correctness": { verdict: "pass" },
      "Composition & platform fit": { verdict: "pass" },
      "Temporal / audio quality": {
        verdict: "critical",
        repair: "Flicker on product region at 00:04 — re-render shot 2",
      },
      "Distinctiveness / authenticity": { verdict: "pass" },
      "Technical export / rights": {
        verdict: "warn",
        repair: "Add AI-edit disclosure to manifest",
      },
    },
    comments: [],
    requiredRoles: ["Reviewer"],
  },
];

export default function Review() {
  const {
    backendEnabled,
    logAudit,
    seats,
    reviewTasks,
    decideReviewTask,
    addReviewComment,
    exportWorkflowRun,
    refreshServerState,
  } = useStore();
  const [tasks, setTasks] = useState<Task[]>(backendEnabled ? [] : SEED_TASKS);
  const [sel, setSel] = useState("t1");
  const [draft, setDraft] = useState("");
  const [region, setRegion] = useState("headline");
  const [linkCopied, setLinkCopied] = useState(false);
  const [serverError, setServerError] = useState("");

  useEffect(() => {
    if (reviewTasks.length > 0) setSel(reviewTasks[0].id);
  }, [reviewTasks.length]);

  const persistedTasks: Task[] = reviewTasks.map(toLocalTask);
  const allTasks = [
    ...persistedTasks,
    ...tasks.filter((task) => !reviewTasks.some((persisted) => persisted.id === task.id)),
  ];
  const task = allTasks.find((t) => t.id === sel) ?? allTasks[0];
  if (!task)
    return (
      <div className="space-y-8">
        <PageHeader
          kicker="Review queue"
          title="No review tasks yet"
          desc="Approved workflow outputs will appear here when the backend creates a review task."
        />
        <Panel title="Awaiting production output">
          <div className="p-6 text-sm text-ink-soft">
            No sample review is shown in server mode. Run a workflow or Daily Autopilot plan to
            create the first task.
          </div>
        </Panel>
      </div>
    );
  const isPersisted = reviewTasks.some((item) => item.id === task.id);
  const rows: ScoreRow[] = DIMENSIONS.map((d) => ({
    ...d,
    verdict: task.verdicts[d.dim]?.verdict ?? "pass",
    repair: task.verdicts[d.dim]?.repair,
  }));
  const blocked = rows.some((r) => r.verdict === "critical");

  const decide = (status: Task["status"], label: string) => {
    if (isPersisted) {
      const persistedStatus = status === "pending" ? "refinement_requested" : status;
      if (backendEnabled) {
        const serverDecision =
          status === "approved" ? "approve" : status === "rejected" ? "reject" : "refine";
        void decideServerReview(task.id, serverDecision, label)
          .then(() => refreshServerState())
          .catch((error) =>
            setServerError(
              error instanceof Error ? error.message : "The server could not save this decision.",
            ),
          );
        return;
      }
      decideReviewTask(task.id, persistedStatus);
      return;
    }
    setTasks((ts) => ts.map((t) => (t.id === sel ? { ...t, status } : t)));
    logAudit(label, `${task.title} · ${task.version.split(" · ")[0]}`);
  };

  const addComment = () => {
    if (!draft.trim()) return;
    if (isPersisted) {
      if (backendEnabled) {
        void addServerReviewComment(task.id, { text: draft, region })
          .then(() => refreshServerState())
          .catch((error) =>
            setServerError(
              error instanceof Error ? error.message : "The server could not save this comment.",
            ),
          );
      } else {
        addReviewComment(task.id, { author: "Aarav Mehta", text: draft, region });
      }
    } else {
      setTasks((ts) =>
        ts.map((t) =>
          t.id === sel
            ? {
                ...t,
                comments: [
                  ...t.comments,
                  {
                    id: `${Date.now()}`,
                    author: "Aarav Mehta",
                    text: draft,
                    region,
                  },
                ],
              }
            : t,
        ),
      );
    }
    setDraft("");
  };

  const copyLink = async () => {
    setServerError("");
    if (isPersisted && backendEnabled) {
      try {
        const result = await createServerReviewLink(task.id);
        await navigator.clipboard?.writeText(result.url);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 1800);
        return;
      } catch (error) {
        setServerError(
          error instanceof Error ? error.message : "The review link could not be created.",
        );
        return;
      }
    }
    setLinkCopied(true);
    logAudit("shared review link", task.title);
    setTimeout(() => setLinkCopied(false), 1800);
  };

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="P0 · Human control before publish"
        title="Review inbox"
        desc="Approval is a workflow, not a hidden boolean. Comment on an asset or frame, approve/reject/refine, and every decision is timestamped and audited. A critical QA failure can never be published."
        right={
          <Btn variant="line" onClick={copyLink}>
            {linkCopied ? "✓ Link copied" : "Share review link"}
          </Btn>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* task list */}
        <Panel title="Tasks">
          <div>
            {allTasks.map((t) => (
              <button
                key={t.id}
                onClick={() => setSel(t.id)}
                className={`flex w-full items-start gap-3 border-b border-line px-4 py-3 text-left transition-colors last:border-0 ${
                  sel === t.id ? "bg-paper-deep" : "hover:bg-paper-deep/50"
                }`}
              >
                <span
                  className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                    t.status === "approved"
                      ? "bg-leaf"
                      : t.status === "rejected"
                        ? "bg-saffron-deep"
                        : "bg-marigold"
                  }`}
                />
                <span>
                  <span className="block text-sm font-medium leading-tight">{t.title}</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-soft">
                    {t.kind} · {t.status}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </Panel>

        {/* detail */}
        <div className="space-y-6">
          <Panel
            title={task.title}
            right={
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-soft">
                {task.version}
              </span>
            }
          >
            <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">
              {task.images.map((id) => (
                <img
                  key={id}
                  src={img(id, 300, 375)}
                  alt="asset under review"
                  className="aspect-[4/5] rounded-lg object-cover"
                />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-4">
              <span className="font-mono text-[11px] text-ink-soft">
                Approval needs: {task.requiredRoles.join(" + ")}
              </span>
              <div className="ml-auto flex gap-2">
                <Btn
                  variant="line"
                  onClick={() => decide("rejected", "rejected")}
                  disabled={task.status !== "pending"}
                >
                  Reject
                </Btn>
                <Btn variant="line" onClick={() => decide("pending", "requested refine")}>
                  Request refine
                </Btn>
                <Btn
                  onClick={() => decide("approved", "approved")}
                  disabled={blocked || task.status === "approved"}
                  title={blocked ? "Blocked by critical QA failure" : undefined}
                >
                  {task.status === "approved" ? "✓ Approved" : blocked ? "Blocked" : "Approve"}
                </Btn>
                {isPersisted && task.status === "approved" && task.runId && (
                  <Btn
                    variant="line"
                    onClick={() => {
                      if (backendEnabled) {
                        void exportServerRun(task.runId!)
                          .then(() => refreshServerState())
                          .catch((error) =>
                            setServerError(
                              error instanceof Error
                                ? error.message
                                : "The server could not export this run.",
                            ),
                          );
                      } else {
                        exportWorkflowRun(task.runId!);
                      }
                    }}
                  >
                    Export manifest
                  </Btn>
                )}
              </div>
            </div>
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Comments">
              <div className="p-5">
                <div className="space-y-3">
                  {task.comments.length === 0 && (
                    <p className="font-mono text-[12px] text-ink-soft">No comments yet.</p>
                  )}
                  {task.comments.map((c) => (
                    <div key={c.id} className="rounded-lg border border-line px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{c.author}</span>
                        <span className="rounded-full bg-paper-deep px-2 py-0.5 font-mono text-[9px] uppercase text-ink-soft">
                          @{c.region}
                        </span>
                      </div>
                      <p className="mt-1 text-[13px] text-ink-soft">{c.text}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex gap-2">
                  <select
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    className="rounded-lg border border-line bg-paper px-2 text-[12px] outline-none"
                  >
                    {["headline", "product", "cta", "logo", "frame 00:04"].map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addComment()}
                    placeholder="Comment on this region…"
                    className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-saffron-deep"
                  />
                  <Btn onClick={addComment}>Post</Btn>
                </div>
              </div>
            </Panel>

            <Panel title="Quality gate">
              <div className="p-5">
                <ScoreCard rows={rows} kind={task.kind} />
              </div>
            </Panel>
          </div>
        </div>
      </div>

      <AuditLog />
      {serverError && <p className="font-mono text-[11px] text-saffron-deep">{serverError}</p>}
      <p className="font-mono text-[11px] text-ink-soft">
        Seats with review rights: {seats.map((s) => s.name).join(", ")}
      </p>
    </div>
  );
}

function toLocalTask(task: PersistedReviewTask): Task {
  return {
    id: task.id,
    runId: task.runId,
    title: task.title,
    brand: task.brand,
    version: task.version,
    kind: task.kind,
    images: task.images,
    status:
      task.status === "approved" ? "approved" : task.status === "rejected" ? "rejected" : "pending",
    verdicts: Object.fromEntries(
      Object.entries(task.verdicts).map(([key, value]) => [
        key,
        { verdict: value.verdict, repair: value.repair },
      ]),
    ) as Task["verdicts"],
    comments: task.comments.map((comment) => ({
      id: comment.id,
      author: comment.author,
      text: comment.text,
      region: comment.region,
    })),
    requiredRoles: task.requiredRoles,
  };
}

function AuditLog() {
  const { audit } = useStore();
  return (
    <Panel title="Audit trail">
      <div className="max-h-56 overflow-y-auto">
        {audit.map((e) => (
          <div
            key={e.id}
            className="flex items-center gap-3 border-b border-line px-5 py-2.5 text-sm last:border-0"
          >
            <span className="font-mono text-[10px] text-ink-soft">
              {new Date(e.ts).toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span className="font-medium">{e.actor}</span>
            <span className="text-saffron-deep">{e.action}</span>
            <span className="truncate text-ink-soft">{e.target}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
