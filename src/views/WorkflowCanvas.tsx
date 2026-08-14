import { useEffect, useRef, useState, type PointerEvent } from "react";
import { PageHeader, Panel, Btn } from "../ui";
import { useStore } from "../store";
import { SAMPLE_IMAGES, img } from "../data";
import {
  createServerWorkflow,
  createServerWorkflowVersion,
  getServerWorkflows,
  publishServerWorkflowVersion,
} from "../client/api";

type NodeType =
  | "input"
  | "brand"
  | "model"
  | "comparison"
  | "condition"
  | "split"
  | "merge"
  | "review"
  | "export";
type Node = { id: string; type: NodeType; x: number; y: number; title: string; sub: string };
type Edge = [string, string];

const NODE_META: Record<NodeType, { color: string; glyph: string; kind: string; logic?: boolean }> =
  {
    input: { color: "#2e3a6e", glyph: "⌨", kind: "Guided brief" },
    brand: { color: "#a6410a", glyph: "❖", kind: "Brand memory" },
    model: { color: "#d1560f", glyph: "✦", kind: "Generate" },
    comparison: { color: "#d1560f", glyph: "⇄", kind: "Compare models" },
    condition: { color: "#4a6b3f", glyph: "⑃", kind: "Condition", logic: true },
    split: { color: "#4a6b3f", glyph: "⋔", kind: "Split / list", logic: true },
    merge: { color: "#4a6b3f", glyph: "⋈", kind: "Merge", logic: true },
    review: { color: "#8a6d1f", glyph: "✓", kind: "Human checkpoint" },
    export: { color: "#201b13", glyph: "⇲", kind: "Multi-format export" },
  };

// typed contracts + bounds for logic/data nodes (blueprint §C5)
const LOGIC_SCHEMA: { node: string; input: string; rule: string; output: string }[] = [
  {
    node: "Condition",
    input: "ProductRow",
    rule: "row.category ∈ {furniture, jewellery, real-estate}",
    output: "branch · else → error",
  },
  {
    node: "Split / list",
    input: "ProductRow[]",
    rule: "fan-out ≤ 200 · bounded",
    output: "ProductRow",
  },
  { node: "Merge", input: "Asset[]", rule: "join on row.sku · typed", output: "CampaignPack" },
];

const W = 200;
const H = 92;

const INITIAL_NODES: Node[] = [
  {
    id: "n1",
    type: "input",
    x: 30,
    y: 40,
    title: "Product brief",
    sub: "SKU · style · must-haves",
  },
  { id: "n2", type: "brand", x: 30, y: 190, title: "Kosmic memory", sub: "colours · tone · refs" },
  { id: "n3", type: "model", x: 300, y: 115, title: "4 styled variants", sub: "FLUX.1 pro" },
  { id: "n4", type: "review", x: 570, y: 115, title: "Approve on WhatsApp", sub: "pauses the run" },
  {
    id: "n5",
    type: "export",
    x: 840,
    y: 115,
    title: "Feed · Story · Landscape",
    sub: "3 aspect ratios",
  },
];
const INITIAL_EDGES: Edge[] = [
  ["n1", "n3"],
  ["n2", "n3"],
  ["n3", "n4"],
  ["n4", "n5"],
];

const RUN_ORDER = ["n1", "n2", "n3", "n4", "n5"];

export default function WorkflowCanvas() {
  const { spend, backendEnabled } = useStore();
  const [nodes, setNodes] = useState<Node[]>(INITIAL_NODES);
  const [edges, setEdges] = useState<Edge[]>(INITIAL_EDGES);
  const [active, setActive] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "running" | "paused" | "done">("idle");
  const [log, setLog] = useState<string[]>([]);
  const [serverTemplateId, setServerTemplateId] = useState<string | null>(null);
  const [serverVersionId, setServerVersionId] = useState<string | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const surface = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!backendEnabled) return;
    void getServerWorkflows()
      .then((templates) => {
        const template = templates.find(
          (candidate) =>
            candidate.category === "product-creative" && typeof candidate.id === "string",
        );
        if (!template) return;
        setServerTemplateId(String(template.id));
        const versions = Array.isArray(template.versions) ? template.versions : [];
        const latest = versions.find(
          (version) => version && typeof version === "object" && typeof version.id === "string",
        );
        if (latest) setServerVersionId(String((latest as Record<string, unknown>).id));
        setLog(["✓ Loaded the workspace product-creative workflow."]);
      })
      .catch((error) => {
        setLog([
          error instanceof Error ? error.message : "The workspace workflow could not be loaded.",
        ]);
      });
  }, [backendEnabled]);

  const graphForServer = () => ({
    nodes: nodes.map((node) => ({
      id: node.id,
      type:
        node.type === "brand"
          ? "brand_context"
          : node.type === "model"
            ? "image_generation"
            : node.type === "comparison"
              ? "model_comparison"
              : node.type === "review"
                ? "human_review"
                : node.type,
      config: {
        title: node.title,
        subtitle: node.sub,
        canvas: { x: node.x, y: node.y },
        ...(node.type === "model" ? { promptPrefix: node.title } : {}),
      },
    })),
    edges: edges.map(([from, to]) => ({ from, to })),
  });

  const saveWorkflow = async () => {
    if (!backendEnabled || saveBusy) return null;
    setSaveBusy(true);
    try {
      const graph = graphForServer();
      if (!serverTemplateId) {
        const created = await createServerWorkflow({
          name: "Canvas product creative",
          category: "product-creative",
          graph,
        });
        const templateId = String(created.template.id);
        const versionId = String(created.version.id);
        await publishServerWorkflowVersion(templateId, versionId);
        setServerTemplateId(templateId);
        setServerVersionId(versionId);
        setLog(["✓ Workflow graph saved and published as v1.0.0."]);
        return versionId;
      }
      const version = await createServerWorkflowVersion(serverTemplateId, {
        version: `v${Date.now()}.0.0`,
        graph,
      });
      const versionId = String(version.id);
      await publishServerWorkflowVersion(serverTemplateId, versionId);
      setServerVersionId(versionId);
      setLog(["✓ New immutable workflow version saved and published."]);
      return versionId;
    } catch (error) {
      setLog([error instanceof Error ? error.message : "The workflow could not be saved."]);
      return null;
    } finally {
      setSaveBusy(false);
    }
  };

  const onPointerDown = (e: PointerEvent, id: string) => {
    const n = nodes.find((x) => x.id === id)!;
    const rect = surface.current!.getBoundingClientRect();
    drag.current = { id, dx: e.clientX - rect.left - n.x, dy: e.clientY - rect.top - n.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!drag.current) return;
    const rect = surface.current!.getBoundingClientRect();
    const x = Math.max(0, e.clientX - rect.left - drag.current.dx);
    const y = Math.max(0, e.clientY - rect.top - drag.current.dy);
    setNodes((ns) => ns.map((n) => (n.id === drag.current!.id ? { ...n, x, y } : n)));
  };
  const onPointerUp = () => (drag.current = null);

  const addNode = (type: NodeType) => {
    const id = crypto.randomUUID().slice(0, 4);
    setNodes((ns) => [
      ...ns,
      {
        id,
        type,
        x: 300 + Math.random() * 200,
        y: 300 + Math.random() * 60,
        title: NODE_META[type].kind,
        sub: "new node",
      },
    ]);
  };

  const push = (m: string) => setLog((l) => [m, ...l].slice(0, 8));

  const runFrom = (startIdx: number) => {
    if (backendEnabled) {
      setLog([
        "Use Daily Creative Autopilot for a durable backend run; this canvas is a visual editor only.",
      ]);
      return;
    }
    setState("running");
    let i = startIdx;
    const step = () => {
      if (i >= RUN_ORDER.length) {
        setState("done");
        setActive(null);
        spend("Workflow run · catalog-to-creative.v1", 3, "image");
        push("✓ Run complete — 4 assets exported, 3 credits charged");
        return;
      }
      const id = RUN_ORDER[i];
      const node = nodes.find((n) => n.id === id);
      setActive(id);
      if (node) push(`▸ ${NODE_META[node.type].kind}: ${node.title}`);
      if (node?.type === "review") {
        setState("paused");
        push("⏸ Paused — awaiting human approval");
        return;
      }
      i += 1;
      setTimeout(step, 650);
    };
    step();
  };

  const run = () => {
    setLog([]);
    runFrom(0);
  };
  const approve = () => {
    push("✓ Approved by Reviewer — continuing");
    runFrom(RUN_ORDER.indexOf("n4") + 1);
  };
  const refine = () => {
    push("↺ Refinement requested — re-running generate");
    runFrom(RUN_ORDER.indexOf("n3"));
  };

  const center = (n: Node) => ({ x: n.x + W / 2, y: n.y + H / 2 });

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Phase 2 · Node-based builder"
        title="Workflow canvas"
        desc="Drag-and-drop builder — bina code ke workflow customize karo. Nodes ko ghumao, run karo, aur Human-checkpoint par workflow ruk kar approval maangta hai."
        right={
          <div className="flex items-center gap-2">
            {backendEnabled && (
              <Btn variant="line" onClick={() => void saveWorkflow()} disabled={saveBusy}>
                {saveBusy ? "Saving…" : serverVersionId ? "Save version" : "Save workflow"}
              </Btn>
            )}
            {state === "paused" ? (
              <>
                <Btn variant="line" onClick={refine}>
                  Request refine
                </Btn>
                <Btn onClick={approve}>Approve ✓</Btn>
              </>
            ) : (
              <Btn onClick={run} disabled={state === "running"}>
                {state === "running" ? "Running…" : "Run workflow"}
              </Btn>
            )}
          </div>
        }
      />

      {/* node palette */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">
          Add node:
        </span>
        {(Object.keys(NODE_META) as NodeType[]).map((t) => (
          <button
            key={t}
            onClick={() => addNode(t)}
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[11px] transition-colors hover:border-ink ${
              NODE_META[t].logic ? "border-leaf/50 bg-leaf/5" : "border-line"
            }`}
          >
            <span style={{ color: NODE_META[t].color }}>{NODE_META[t].glyph}</span>
            {NODE_META[t].kind}
          </button>
        ))}
      </div>

      {/* logic/data node schemas */}
      <Panel title="Logic & data nodes · typed contracts behind safe schemas">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-line font-mono text-[10px] uppercase tracking-[0.1em] text-ink-soft">
                <th className="px-5 py-2.5 text-left font-normal">Node</th>
                <th className="px-5 py-2.5 text-left font-normal">Input type</th>
                <th className="px-5 py-2.5 text-left font-normal">Safe rule / bound</th>
                <th className="px-5 py-2.5 text-left font-normal">Output</th>
              </tr>
            </thead>
            <tbody>
              {LOGIC_SCHEMA.map((s) => (
                <tr key={s.node} className="border-b border-line last:border-0">
                  <td className="px-5 py-3 font-medium">{s.node}</td>
                  <td className="px-5 py-3 font-mono text-[12px] text-indigo">{s.input}</td>
                  <td className="px-5 py-3 font-mono text-[12px] text-ink-soft">{s.rule}</td>
                  <td className="px-5 py-3 font-mono text-[12px] text-leaf">{s.output}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-line px-5 py-3 font-mono text-[10px] text-ink-soft">
          <span>furniture → lifestyle scene</span>
          <span>jewellery → macro + reflection pass</span>
          <span>real-estate → wide + text overlay</span>
          <span className="text-saffron-deep">invalid row → error branch (actionable message)</span>
          <span>no arbitrary code · max depth 3 · fan-out ≤ 200</span>
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        {/* canvas */}
        <div
          ref={surface}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="relative h-[440px] touch-none overflow-hidden rounded-2xl border border-line"
          style={{
            backgroundColor: "#fbf8f2",
            backgroundImage: "radial-gradient(circle, #d6cdbb 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        >
          {/* edges */}
          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            {edges.map(([a, b], i) => {
              const na = nodes.find((n) => n.id === a);
              const nb = nodes.find((n) => n.id === b);
              if (!na || !nb) return null;
              const p1 = { x: na.x + W, y: na.y + H / 2 };
              const p2 = { x: nb.x, y: nb.y + H / 2 };
              const mx = (p1.x + p2.x) / 2;
              const live = active === b || active === a;
              return (
                <path
                  key={i}
                  d={`M ${p1.x} ${p1.y} C ${mx} ${p1.y}, ${mx} ${p2.y}, ${p2.x} ${p2.y}`}
                  fill="none"
                  stroke={live ? "#d1560f" : "#c9bfad"}
                  strokeWidth={live ? 2.5 : 1.5}
                  className="transition-colors"
                />
              );
            })}
          </svg>

          {/* nodes */}
          {nodes.map((n) => {
            const meta = NODE_META[n.type];
            const on = active === n.id;
            return (
              <div
                key={n.id}
                onPointerDown={(e) => onPointerDown(e, n.id)}
                className={`absolute cursor-grab select-none rounded-xl border bg-card shadow-sm transition-shadow active:cursor-grabbing ${
                  on ? "shadow-lg ring-2 ring-saffron-deep" : "border-line"
                }`}
                style={{ left: n.x, top: n.y, width: W, height: H }}
              >
                <div
                  className="flex items-center gap-2 rounded-t-xl px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-white"
                  style={{ background: meta.color }}
                >
                  <span>{meta.glyph}</span>
                  {meta.kind}
                  {n.type === "review" && state === "paused" && on && (
                    <span className="ml-auto animate-pulse">● live</span>
                  )}
                </div>
                <div className="px-3 py-2">
                  <div className="text-sm font-medium leading-tight">{n.title}</div>
                  <div className="mt-0.5 font-mono text-[10px] text-ink-soft">{n.sub}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* run log */}
        <Panel title="Run log">
          <div className="p-4">
            <div className="mb-3 flex items-center gap-2 font-mono text-[11px]">
              <span
                className={`h-2 w-2 rounded-full ${
                  state === "running"
                    ? "animate-pulse bg-saffron-deep"
                    : state === "paused"
                      ? "bg-marigold"
                      : state === "done"
                        ? "bg-leaf"
                        : "bg-line"
                }`}
              />
              <span className="uppercase tracking-[0.12em] text-ink-soft">{state}</span>
            </div>
            <div className="space-y-2 font-mono text-[11px] leading-relaxed text-ink-soft">
              {log.length === 0 && (
                <p className="text-ink-soft/60">Run the workflow to see live steps…</p>
              )}
              {log.map((l, i) => (
                <p key={i} className={i === 0 ? "text-ink" : ""}>
                  {l}
                </p>
              ))}
            </div>
          </div>
        </Panel>
      </div>

      {/* review preview */}
      {!backendEnabled && (state === "paused" || state === "done") && (
        <Panel
          title={state === "paused" ? "Awaiting approval — 4 variants" : "Approved & exported"}
        >
          <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">
            {SAMPLE_IMAGES.slice(0, 4).map((id) => (
              <img
                key={id}
                src={img(id, 300, 375)}
                alt="variant"
                className="aspect-[4/5] rounded-lg object-cover"
              />
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
