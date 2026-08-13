import { useEffect, useState } from "react";
import { PageHeader, Panel, Btn } from "../ui";
import { useStore } from "../store";
import {
  createServerDriveSync,
  disconnectServerConnection,
  getServerChannelIdentities,
  getServerConnections,
  verifyServerChannelIdentity,
} from "../client/api";

type Health = "connected" | "expiring" | "disconnected";
type Connector = {
  id: string;
  name: string;
  scope: string;
  health: Health;
  detail: string;
};

const HEALTH_META: Record<Health, { tint: string; label: string }> = {
  connected: { tint: "bg-leaf/15 text-leaf", label: "connected" },
  expiring: { tint: "bg-marigold/20 text-saffron-deep", label: "token expiring" },
  disconnected: { tint: "bg-paper-deep text-ink-soft", label: "not connected" },
};

// ── WhatsApp approval flow (message-window / template aware) ──
type Msg = { from: "user" | "bot"; text: string; template?: boolean };
const THREAD: Msg[] = [
  { from: "user", text: "Diwali sofa creative bhej do, 3 hooks" },
  {
    from: "bot",
    text: "Got it. Workspace: Kosmic Furniture · brand v7. Est. cost 24 credits, ~90s. Reply YES to reserve.",
  },
  { from: "user", text: "YES" },
  { from: "bot", text: "✅ Reserved. Running… I will send a review link when ready." },
  {
    from: "bot",
    text: "Review link (expires 24h): creo.to/r/9fa2 — approve, request refine, or reject.",
  },
];

export default function Connectors() {
  const { backendEnabled, logAudit } = useStore();
  const [serverError, setServerError] = useState("");
  const [identities, setIdentities] = useState<
    Awaited<ReturnType<typeof getServerChannelIdentities>>
  >([]);
  const [driveStatus, setDriveStatus] = useState("");
  const [connectors, setConnectors] = useState<Connector[]>([
    {
      id: "whatsapp",
      name: "WhatsApp Business",
      scope: "messages, templates",
      health: "connected",
      detail: "Kia · +91 98••• ••210 · Meta Graph",
    },
    {
      id: "drive",
      name: "Google Drive",
      scope: "drive.file (least-privilege)",
      health: "expiring",
      detail: "studio@kosmic.in · token expires in 3 days",
    },
    {
      id: "meta",
      name: "Meta / Instagram",
      scope: "content_publish",
      health: "disconnected",
      detail: "Requires app review + business account",
    },
  ]);

  useEffect(() => {
    if (!backendEnabled) return;
    void Promise.all([getServerConnections(), getServerChannelIdentities()])
      .then(([connections, channelIdentities]) => {
        setIdentities(channelIdentities);
        setConnectors(
          connections.map((connection) => ({
            id: connection.id,
            name: connection.provider,
            scope: connection.scopes.join(", "),
            health:
              connection.health === "HEALTHY"
                ? "connected"
                : connection.health === "EXPIRING"
                  ? "expiring"
                  : "disconnected",
            detail: connection.expiresAt
              ? `expires ${new Date(connection.expiresAt).toLocaleDateString("en-IN")}`
              : "encrypted workspace connection",
          })),
        );
      })
      .catch((error) =>
        setServerError(
          error instanceof Error ? error.message : "The server could not load connector health.",
        ),
      );
  }, [backendEnabled]);

  const setHealth = (id: string, health: Health, detail?: string) =>
    setConnectors((cs) =>
      cs.map((c) => (c.id === id ? { ...c, health, detail: detail ?? c.detail } : c)),
    );

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Phase 3 · Channels & connectors"
        title="Connectors & channels"
        desc="Jahaan customer already kaam karta hai wahin request, review aur approval. WhatsApp se trigger, Google Drive se assets, aur Meta/Instagram par export-first publishing — sab least-privilege scopes, token-health, aur explicit confirmation ke saath."
      />

      {serverError && <p className="font-mono text-[11px] text-saffron-deep">{serverError}</p>}

      {/* connector health */}
      <div className="grid gap-4 md:grid-cols-3">
        {connectors.map((c) => {
          const m = HEALTH_META[c.health];
          return (
            <Panel key={c.id} title={c.name}>
              <div className="p-5">
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${m.tint}`}
                >
                  {m.label}
                </span>
                <div className="mt-3 font-mono text-[11px] leading-relaxed text-ink-soft">
                  {c.detail}
                </div>
                <div className="mt-1 font-mono text-[10px] text-ink-soft">scopes: {c.scope}</div>
                <div className="mt-4 flex gap-2">
                  {c.health === "disconnected" ? (
                    <Btn
                      onClick={() => {
                        if (backendEnabled) {
                          setServerError(
                            "OAuth authorization must be completed by the configured connector adapter.",
                          );
                        } else {
                          setHealth(c.id, "connected", "Connected · least-privilege");
                          logAudit("connected", c.name);
                        }
                      }}
                    >
                      Connect
                    </Btn>
                  ) : (
                    <>
                      {c.health === "expiring" && (
                        <Btn
                          onClick={() => {
                            setServerError(
                              "OAuth re-authorization must be completed by the configured connector adapter.",
                            );
                          }}
                        >
                          Re-authorize
                        </Btn>
                      )}
                      <Btn
                        variant="line"
                        onClick={() => {
                          if (backendEnabled) {
                            void disconnectServerConnection(c.id)
                              .then(() =>
                                setHealth(c.id, "disconnected", "Tokens revoked · sync stopped"),
                              )
                              .catch((error) =>
                                setServerError(
                                  error instanceof Error
                                    ? error.message
                                    : "The connector could not be disconnected.",
                                ),
                              );
                          } else {
                            setHealth(c.id, "disconnected", "Tokens revoked · sync stopped");
                            logAudit("disconnected", c.name);
                          }
                        }}
                      >
                        Disconnect
                      </Btn>
                    </>
                  )}
                </div>
              </div>
            </Panel>
          );
        })}
      </div>

      {backendEnabled && identities.length > 0 && (
        <Panel title="Verified channel identities · approval boundary">
          <div className="divide-y divide-line">
            {identities.map((identity) => (
              <div
                key={identity.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div>
                  <div className="text-sm font-medium">
                    {identity.displayName || identity.externalSubject}
                  </div>
                  <div className="font-mono text-[10px] text-ink-soft">
                    {identity.provider} · {identity.externalSubject}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 font-mono text-[9px] uppercase ${identity.status === "VERIFIED" ? "bg-leaf text-paper" : identity.status === "REVOKED" ? "bg-paper-deep text-ink-soft" : "bg-marigold/20 text-saffron-deep"}`}
                  >
                    {identity.status.toLowerCase()}
                  </span>
                  {identity.status === "PENDING" && (
                    <Btn
                      variant="line"
                      onClick={() =>
                        void verifyServerChannelIdentity(identity.id, { status: "VERIFIED" })
                          .then((updated) =>
                            setIdentities((current) =>
                              current.map((item) => (item.id === updated.id ? updated : item)),
                            ),
                          )
                          .catch((error) =>
                            setServerError(
                              error instanceof Error
                                ? error.message
                                : "The channel identity could not be verified.",
                            ),
                          )
                      }
                    >
                      Verify
                    </Btn>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* WhatsApp thread */}
        <Panel title="WhatsApp · request → approval">
          <div className="space-y-3 p-5">
            {THREAD.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.from === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                    m.from === "user" ? "bg-leaf text-paper" : "bg-paper-deep text-ink"
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            <p className="pt-2 font-mono text-[10px] leading-relaxed text-ink-soft">
              Sender mapped to workspace + role after verification · outside the 24h service window
              only approved templates are sent · publishing/destructive actions need explicit
              confirmation.
            </p>
          </div>
        </Panel>

        {/* Drive + Meta */}
        <div className="space-y-6">
          <Panel title="Google Drive · folder mapping">
            <div className="space-y-3 p-5 font-mono text-[12px]">
              <div className="flex items-center justify-between">
                <span className="text-ink-soft">Input folder</span>
                <span>/Clients/Kosmic/incoming</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-soft">Output folder</span>
                <span>/Clients/Kosmic/approved</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-soft">Sync</span>
                <span className="text-leaf">content-hash · idempotent</span>
              </div>
              <p className="pt-1 text-[10px] leading-relaxed text-ink-soft">
                Timestamp-only changes never re-process · manifest + review links written back to
                the output folder.
              </p>
              {backendEnabled && (
                <>
                  <Btn
                    className="mt-2"
                    onClick={() => {
                      setDriveStatus("Starting content-hash sync…");
                      void createServerDriveSync({
                        direction: "PULL",
                        inputFolderId: "clients/kosmic/incoming",
                        idempotencyKey: `drive-sync:${Date.now()}`,
                      })
                        .then(() => setDriveStatus("Sync completed or was recorded for recovery."))
                        .catch((error) =>
                          setDriveStatus(
                            error instanceof Error ? error.message : "Drive sync failed.",
                          ),
                        );
                    }}
                  >
                    Sync incoming folder
                  </Btn>
                  {driveStatus && (
                    <div className="pt-1 text-[10px] text-ink-soft">{driveStatus}</div>
                  )}
                </>
              )}
            </div>
          </Panel>

          <Panel title="Meta / Instagram · export-first publishing">
            <div className="space-y-3 p-5">
              {[
                ["Monsoon sofa · reel", "published", "ig_media 17984… · receipt ✓"],
                ["Diwali carousel", "scheduled", "queued for 18:30 IST"],
                ["Oak console · story", "draft", "export only — awaiting approval"],
                ["Dining set · post", "failed", "media spec rejected — retry safe (no dup)"],
              ].map(([title, state, note]) => {
                const tint =
                  state === "published"
                    ? "text-leaf"
                    : state === "failed"
                      ? "text-saffron-deep"
                      : state === "scheduled"
                        ? "text-indigo"
                        : "text-ink-soft";
                return (
                  <div
                    key={title}
                    className="flex items-center justify-between border-b border-line pb-2 last:border-0 last:pb-0"
                  >
                    <div>
                      <div className="text-[13px] font-medium">{title}</div>
                      <div className="font-mono text-[10px] text-ink-soft">{note}</div>
                    </div>
                    <span className={`font-mono text-[10px] uppercase tracking-wide ${tint}`}>
                      {state}
                    </span>
                  </div>
                );
              })}
              <p className="pt-1 font-mono text-[10px] leading-relaxed text-ink-soft">
                Default is export/draft · publish needs approved output + confirmation showing
                destination, caption & media · every publish returns a receipt or a retryable
                failure.
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
