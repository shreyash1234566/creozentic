"use client";

import { useState } from "react";
import { StoreProvider, useStore } from "./store";
import Overview from "./views/Overview";
import ProductLock from "./views/ProductLock";
import AssetLibrary from "./views/AssetLibrary";
import BrandMemory from "./views/BrandMemory";
import WorkflowCanvas from "./views/WorkflowCanvas";
import ModelStudio from "./views/ModelStudio";
import Batch from "./views/Batch";
import Composer from "./views/Composer";
import VideoStudio from "./views/VideoStudio";
import Localization from "./views/Localization";
import Consistency from "./views/Consistency";
import Connectors from "./views/Connectors";
import Performance from "./views/Performance";
import Scheduler from "./views/Scheduler";
import Marketplace from "./views/Marketplace";
import Review from "./views/Review";
import Billing from "./views/Billing";
import Checklist from "./views/Checklist";
import Governance from "./views/Governance";
import Landing from "./views/Landing";
import DailyAutopilot from "./views/DailyAutopilot";

type NavItem = { id: string; label: string; glyph: string; group?: string };

const NAV: NavItem[] = [
  { id: "overview", label: "Overview", glyph: "◧" },
  { id: "daily", label: "Daily Autopilot", glyph: "◉", group: "Create" },
  { id: "productlock", label: "Product-Lock Studio", glyph: "◈", group: "Create" },
  { id: "assets", label: "Asset library", glyph: "▤" },
  { id: "brand", label: "Brand memory", glyph: "❖" },
  { id: "workflow", label: "Workflow canvas", glyph: "⑂" },
  { id: "batch", label: "Batch generation", glyph: "▦" },
  { id: "composer", label: "Composer", glyph: "⊞" },
  { id: "video", label: "Video Studio", glyph: "▷" },
  { id: "localization", label: "Localization", glyph: "⟐" },
  { id: "consistency", label: "Consistency", glyph: "⊚" },
  { id: "models", label: "Model studio", glyph: "✦" },
  { id: "review", label: "Review inbox", glyph: "⊛", group: "Control" },
  { id: "connectors", label: "Connectors", glyph: "⇄" },
  { id: "scheduler", label: "Scheduled runs", glyph: "◷" },
  { id: "performance", label: "Performance", glyph: "◭" },
  { id: "marketplace", label: "Marketplace", glyph: "◇", group: "Grow" },
  { id: "governance", label: "Governance & enterprise", glyph: "⌘" },
  { id: "billing", label: "Credits & teams", glyph: "❑" },
  { id: "checklist", label: "Feature checklist", glyph: "☑" },
];

function Shell({ initialView, onHome }: { initialView: string; onHome: () => void }) {
  const [view, setView] = useState(initialView);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { credits, brand } = useStore();

  const go = (v: string) => {
    setView(v);
    setMobileOpen(false);
    window.scrollTo({ top: 0 });
  };

  const render = () => {
    switch (view) {
      case "daily":
        return <DailyAutopilot />;
      case "productlock":
        return <ProductLock />;
      case "assets":
        return <AssetLibrary />;
      case "brand":
        return <BrandMemory />;
      case "workflow":
        return <WorkflowCanvas />;
      case "batch":
        return <Batch />;
      case "composer":
        return <Composer />;
      case "video":
        return <VideoStudio />;
      case "localization":
        return <Localization />;
      case "consistency":
        return <Consistency />;
      case "connectors":
        return <Connectors />;
      case "scheduler":
        return <Scheduler />;
      case "performance":
        return <Performance />;
      case "marketplace":
        return <Marketplace />;
      case "governance":
        return <Governance />;
      case "models":
        return <ModelStudio />;
      case "review":
        return <Review />;
      case "billing":
        return <Billing />;
      case "checklist":
        return <Checklist go={go} />;
      default:
        return <Overview go={go} />;
    }
  };

  return (
    <div className="min-h-screen bg-paper text-ink lg:grid lg:grid-cols-[248px_1fr]">
      {/* sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[248px] transform border-r border-line bg-card transition-transform lg:static lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col">
          <button
            onClick={onHome}
            className="block w-full border-b border-line px-5 py-5 text-left"
          >
            <div className="flex items-baseline gap-2">
              <span className="font-display text-xl font-semibold tracking-[-0.02em]">
                Creozentic
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft">
                by Autozentic
              </span>
            </div>
            <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
              creative reliability system
            </div>
          </button>

          <nav className="flex-1 overflow-y-auto px-3 py-4">
            {NAV.map((item) => (
              <div key={item.id}>
                {item.group && (
                  <div className="px-3 pb-1.5 pt-4 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-soft/70">
                    {item.group}
                  </div>
                )}
                <button
                  onClick={() => go(item.id)}
                  className={`mb-0.5 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                    view === item.id
                      ? "bg-ink text-paper"
                      : "text-ink-soft hover:bg-paper-deep hover:text-ink"
                  }`}
                >
                  <span className="w-4 text-center">{item.glyph}</span>
                  {item.label}
                </button>
              </div>
            ))}
          </nav>

          <div className="border-t border-line px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">
                  Credits
                </div>
                <div className="font-display text-lg font-medium text-saffron-deep">
                  {credits.toLocaleString("en-IN")}
                </div>
              </div>
              <button
                onClick={() => go("billing")}
                className="rounded-full border border-line px-3 py-1 font-mono text-[10px] uppercase tracking-wide transition-colors hover:border-ink"
              >
                Top up
              </button>
            </div>
          </div>
        </div>
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-ink/30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* main */}
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-paper/90 px-5 py-3 backdrop-blur lg:px-10">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg border border-line px-3 py-1.5 font-mono text-[12px] lg:hidden"
          >
            ☰ Menu
          </button>
          <div className="hidden font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft lg:block">
            {NAV.find((n) => n.id === view)?.label}
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden font-mono text-[11px] text-ink-soft sm:block">
              {brand.name}
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink font-mono text-[11px] text-paper">
              {brand.name.slice(0, 2).toUpperCase()}
            </span>
          </div>
        </header>

        <main className="flex-1 px-5 py-8 lg:px-10 lg:py-10">
          <div className="mx-auto max-w-6xl">{render()}</div>
        </main>
      </div>
    </div>
  );
}

function Root() {
  const [entered, setEntered] = useState(false);
  const [initialView, setInitialView] = useState("overview");

  if (!entered) {
    return (
      <Landing
        onEnter={(view) => {
          setInitialView(view ?? "overview");
          setEntered(true);
          window.scrollTo({ top: 0 });
        }}
      />
    );
  }
  return <Shell key={initialView} initialView={initialView} onHome={() => setEntered(false)} />;
}

export default function App() {
  return (
    <StoreProvider>
      <Root />
    </StoreProvider>
  );
}
