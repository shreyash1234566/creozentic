import { PageHeader, Panel, PhaseTag, Stat } from "../ui";

const coverage = [
  [
    "Source truth",
    "Asset Library",
    "Assets, product facts, consent, rights, provenance",
    "Connected",
  ],
  [
    "Creative planning",
    "Create / Campaigns",
    "Briefs, campaigns, directions, revisions, daily plans",
    "Connected",
  ],
  [
    "AI editing",
    "AI Video Editor",
    "Evidence, EditPlan, storyboard, B-roll, timeline, QA, repair",
    "Connected",
  ],
  [
    "Video creation",
    "UGC Ad Studio",
    "Quotes, creative requests, media jobs, deterministic outputs",
    "Connected",
  ],
  [
    "Brand intelligence",
    "Brand Brain",
    "Brand voice, references, policies, memory snapshots",
    "Connected",
  ],
  [
    "Review and approval",
    "Review Room",
    "Comments, decisions, review links, final approval",
    "Connected",
  ],
  [
    "Publishing",
    "Calendar & Publish",
    "OAuth connections, schedules, publishing jobs, receipts",
    "External",
  ],
  [
    "Automation",
    "Automation",
    "Workflow nodes, queues, notifications, dead letters, webhooks",
    "Connected",
  ],
  [
    "Platform operations",
    "Platform Services",
    "Provider health, billing, integrations, feature boundaries",
    "External",
  ],
  [
    "Learning loop",
    "Results",
    "Performance observations, scoring, comparisons, recommendations",
    "Connected",
  ],
];

const surfaces = [
  ["Text track", "Transcript words, caption segments, safe-zone plan", "AI Video Editor"],
  ["Audio", "Audio windows, ducking, beat-sync, clipping targets", "AI Video Editor"],
  ["Visual evidence", "Shots, entities, OCR regions, safe regions", "AI Video Editor"],
  [
    "Motion",
    "Motion-graphic rows, bounded motion recipes, renderer metadata",
    "AI Video Editor / UGC Ad Studio",
  ],
  [
    "Memory",
    "Brand/project/editing snapshots and learning context",
    "Brand Brain / AI Video Editor",
  ],
  ["Skills", "Hook, caption, B-roll, motion, QA, scoped-repair executions", "AI Video Editor"],
];

export default function SystemMap() {
  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Architecture / Coverage"
        title="The system, made legible."
        desc="Every major backend capability has a visible operator surface. External rows are intentionally marked until credentials, providers, or production infrastructure are activated."
      />
      <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-3">
        <Stat label="Backend capabilities mapped" value="10" sub="operator surfaces" />
        <Stat
          label="Editor contracts surfaced"
          value="6"
          sub="text · audio · visual · motion · memory · skills"
        />
        <Stat
          label="Runtime posture"
          value="Bounded"
          sub="provider and GPU activation controlled"
        />
      </div>
      <Panel title="Backend → frontend coverage">
        <div className="divide-y divide-line">
          {coverage.map(([domain, surface, detail, status]) => (
            <div
              key={domain}
              className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_1.1fr_2fr_auto] md:items-center"
            >
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-saffron-deep">
                {domain}
              </div>
              <div className="font-medium">{surface}</div>
              <div className="text-sm text-ink-soft">{detail}</div>
              <PhaseTag phase={status} />
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Editor capability surfaces">
        <div className="grid gap-4 p-5 md:grid-cols-2">
          {surfaces.map(([label, detail, surface]) => (
            <div key={label} className="rounded-xl border border-line bg-paper p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{label}</span>
                <PhaseTag phase={surface} />
              </div>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{detail}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
