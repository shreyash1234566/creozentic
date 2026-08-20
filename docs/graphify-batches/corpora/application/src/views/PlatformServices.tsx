import { useEffect, useState } from "react";
import { Btn, PageHeader, Panel } from "../ui";
import {
  getReferenceIntegrations,
  runPlatformIntegration,
  type PlatformIntegrationKind,
  type ReferenceIntegrationStatus,
} from "../client/api";
import { useStore } from "../store";

const services: Array<{
  id: PlatformIntegrationKind;
  label: string;
  source: string;
  description: string;
  action: string;
}> = [
  {
    id: "experiment",
    label: "Experiments",
    source: "GrowthBook",
    description:
      "Evaluate a feature flag for the active workspace before enabling a workflow or UI path.",
    action: "Evaluate flag",
  },
  {
    id: "notification",
    label: "Notifications",
    source: "Novu",
    description: "Trigger a workspace notification workflow with an idempotent delivery key.",
    action: "Send test notification",
  },
  {
    id: "billing",
    label: "Billing",
    source: "Lago",
    description: "Open a hosted checkout boundary for a workspace plan or credit top-up.",
    action: "Create checkout",
  },
  {
    id: "webhook",
    label: "Webhooks",
    source: "Svix-compatible",
    description:
      "Verify signed provider events before accepting them into the workspace event stream.",
    action: "Verify event",
  },
];

export default function PlatformServices() {
  const { backendEnabled } = useStore();
  const [busy, setBusy] = useState<string>("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [references, setReferences] = useState<ReferenceIntegrationStatus[]>([]);
  useEffect(() => {
    if (backendEnabled)
      void getReferenceIntegrations()
        .then(setReferences)
        .catch(() => setReferences([]));
  }, [backendEnabled]);
  const run = async (service: (typeof services)[number]) => {
    setBusy(service.id);
    setMessage("");
    setError("");
    try {
      const input: Record<string, unknown> =
        service.id === "experiment"
          ? { key: "editor.platform-services", attributes: { surface: "platform-services" } }
          : service.id === "notification"
            ? {
                workflow: "workspace-test",
                payload: { source: "Creozentic Platform Services" },
                idempotencyKey: `platform-services-${Date.now()}`,
              }
            : service.id === "billing"
              ? {
                  priceId: "credits-monthly",
                  successUrl: window.location.href,
                  cancelUrl: window.location.href,
                }
              : { payload: { type: "platform.test", createdAt: new Date().toISOString() } };
      const result = await runPlatformIntegration(service.id, input);
      setMessage(`${service.label}: ${JSON.stringify(result)}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `${service.label} request failed.`);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="P4 · Connected platform services"
        title="Platform Services"
        desc="The integration layer behind publishing, experiments, billing, notifications, and signed events. Existing product surfaces remain unchanged; this view makes the connected service boundaries inspectable."
      />
      {!backendEnabled && (
        <div className="rounded-xl border border-marigold/40 bg-marigold/10 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-soft">
          Backend required · service actions remain disabled in demo mode
        </div>
      )}
      {message && (
        <div className="rounded-xl border border-leaf/30 bg-leaf/10 px-4 py-3 text-sm text-leaf">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {services.map((service) => (
          <Panel key={service.id} title={service.label}>
            <div className="flex items-center justify-between gap-3">
              <span className="rounded-full bg-paper-deep px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-soft">
                {service.source}
              </span>
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-leaf">
                adapter ready
              </span>
            </div>
            <p className="mt-4 text-sm text-ink-soft">{service.description}</p>
            <Btn
              className="mt-5"
              onClick={() => void run(service)}
              disabled={!backendEnabled || busy === service.id}
            >
              {busy === service.id ? "Calling…" : service.action}
            </Btn>
          </Panel>
        ))}
      </div>
      <Panel title="Cloned reference integrations">
        <div className="space-y-2">
          {references.length ? (
            references.map((reference) => (
              <div
                key={reference.id}
                className="flex flex-col gap-2 rounded-xl border border-line p-3 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.12em]">
                    {reference.id}
                  </div>
                  <div className="mt-1 text-xs text-ink-soft">{reference.repository}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[9px] text-ink-soft">{reference.revision}</span>
                  <span className="rounded-full bg-leaf/10 px-2 py-1 font-mono text-[9px] uppercase text-leaf">
                    {reference.wired ? "wired" : "not wired"}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-ink-soft">
              Enable the backend to inspect the six runtime reference boundaries.
            </p>
          )}
        </div>
      </Panel>
      <Panel title="Authentication & social adapters">
        <div className="grid gap-3 md:grid-cols-3">
          {[
            "Better Auth · organizations / OAuth / passkeys / TOTP",
            "Postiz-compatible · Meta / TikTok / YouTube / LinkedIn",
            "Shared provider gateway · AI / speech / video / storage",
          ].map((label) => (
            <div key={label} className="rounded-xl bg-paper-deep p-4 text-sm">
              {label}
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-ink-soft">
          These flows are activated through account credentials and provider endpoints; their typed
          contracts and runtime registry are part of the project.
        </p>
      </Panel>
    </div>
  );
}
