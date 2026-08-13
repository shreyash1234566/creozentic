import { useEffect, useState } from "react";
import { PageHeader, Panel, Btn, Stat } from "../ui";
import { useStore, type Seat } from "../store";
import { createServerTopup, getServerUsage } from "../client/api";

const PLANS = [
  {
    name: "Starter",
    inr: 1499,
    credits: 1000,
    seats: 1,
    feats: ["1 brand", "Image + edit", "WhatsApp delivery"],
  },
  {
    name: "Studio",
    inr: 4999,
    credits: 4000,
    seats: 3,
    feats: ["5 brands", "Batch + Composer", "Model comparison"],
    popular: true,
  },
  {
    name: "Agency",
    inr: 14999,
    credits: 14000,
    seats: 10,
    feats: ["Unlimited brands", "Video credits", "White-label"],
  },
];

const TOPUPS = [250, 500, 1000, 2500];

const KIND_COLOR: Record<string, string> = {
  image: "text-saffron-deep",
  edit: "text-indigo",
  video: "text-leaf",
  text: "text-ink-soft",
  topup: "text-marigold",
};

export default function Billing() {
  const { backendEnabled, credits, ledger, topup, seats, addSeat, removeSeat } = useStore();
  const [gateway, setGateway] = useState<"razorpay" | "stripe">("razorpay");
  const [newSeat, setNewSeat] = useState({ name: "", email: "", role: "Editor" as Seat["role"] });
  const [billingError, setBillingError] = useState("");
  const [serverUsage, setServerUsage] = useState<{
    creditsConsumed: number;
    providerCostMinor: number;
    providerCostCurrency: string;
  } | null>(null);

  useEffect(() => {
    if (!backendEnabled) return;
    void getServerUsage()
      .then((usage) => setServerUsage(usage.summary))
      .catch(() => undefined);
  }, [backendEnabled]);

  const spent = ledger.filter((l) => l.credits < 0).reduce((s, l) => s + Math.abs(l.credits), 0);
  const providerCost = serverUsage?.providerCostMinor ?? 0;

  const add = () => {
    if (!newSeat.name || !newSeat.email) return;
    addSeat(newSeat);
    setNewSeat({ name: "", email: "", role: "Editor" });
  };

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Phase 2 · Metering"
        title="Credits, billing & teams"
        desc="Usage metering, plans aur seats — Stripe (global) + Razorpay (India). Video credits image se alag metered, taaki heavy users par margin na toote."
        right={
          <div className="flex overflow-hidden rounded-full border border-line font-mono text-[11px]">
            {(["razorpay", "stripe"] as const).map((g) => (
              <button
                key={g}
                onClick={() => setGateway(g)}
                className={`px-4 py-2 capitalize transition-colors ${gateway === g ? "bg-ink text-paper" : "text-ink-soft"}`}
              >
                {g}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
        <Stat
          label="Credit balance"
          value={credits.toLocaleString("en-IN")}
          sub="expires monthly"
        />
        <Stat
          label={backendEnabled ? "Consumed this cycle" : "Spent this cycle"}
          value={(serverUsage?.creditsConsumed ?? spent).toLocaleString("en-IN")}
          sub="across all workflows"
        />
        <Stat
          label={backendEnabled ? "Provider cost" : "Margin preview unavailable"}
          value={
            backendEnabled
              ? `${serverUsage?.providerCostCurrency ?? "USD"} ${providerCost.toLocaleString("en-IN")}`
              : "—"
          }
          sub={backendEnabled ? "recorded provider ledger" : "connect billing data first"}
        />
      </div>

      {/* wallet + topup */}
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel title={`Top up · ${gateway}`}>
          <div className="p-5">
            <div className="grid grid-cols-4 gap-2">
              {TOPUPS.map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setBillingError("");
                    if (!backendEnabled) {
                      topup(t);
                      return;
                    }
                    void createServerTopup({
                      units: t,
                      provider: gateway,
                      idempotencyKey: `topup-${gateway}-${t}-${Date.now()}`,
                    }).catch((error) =>
                      setBillingError(
                        error instanceof Error ? error.message : "Checkout is not configured.",
                      ),
                    );
                  }}
                  className="rounded-xl border border-line py-4 text-center transition-colors hover:border-saffron-deep hover:bg-paper-deep"
                >
                  <div className="font-display text-xl font-medium text-saffron-deep">+{t}</div>
                  <div className="font-mono text-[10px] text-ink-soft">₹{Math.round(t * 1.5)}</div>
                </button>
              ))}
            </div>
            <p className="mt-4 font-mono text-[11px] leading-relaxed text-ink-soft">
              Top-ups available during peak; unused credits expire at cycle end — matching the
              market-standard pattern.
            </p>
            {billingError && (
              <p className="mt-3 font-mono text-[11px] text-saffron-deep">{billingError}</p>
            )}
          </div>
        </Panel>

        {/* ledger */}
        <Panel title="Usage ledger" className="overflow-hidden">
          <div className="max-h-[220px] overflow-y-auto">
            {ledger.map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between border-b border-line px-5 py-3 last:border-0"
              >
                <div>
                  <div className="text-sm">{l.label}</div>
                  <div className="font-mono text-[10px] text-ink-soft">
                    {new Date(l.ts).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
                <span
                  className={`font-mono text-sm ${l.credits < 0 ? "text-ink" : "text-leaf"} ${KIND_COLOR[l.kind]}`}
                >
                  {l.credits > 0 ? "+" : ""}
                  {l.credits}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* plans */}
      <div>
        <div className="mb-4 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">
          Plans · INR-first
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {PLANS.map((p) => (
            <div
              key={p.name}
              className={`rounded-2xl border p-6 ${p.popular ? "border-saffron-deep bg-card" : "border-line bg-card"}`}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display text-2xl font-medium">{p.name}</h3>
                {p.popular && (
                  <span className="rounded-full bg-saffron-deep px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-paper">
                    popular
                  </span>
                )}
              </div>
              <div className="mt-3 font-display text-3xl font-medium">
                ₹{p.inr.toLocaleString("en-IN")}
                <span className="font-sans text-sm font-normal text-ink-soft">/mo</span>
              </div>
              <div className="mt-1 font-mono text-[11px] text-ink-soft">
                {p.credits.toLocaleString("en-IN")} credits · {p.seats} seat{p.seats > 1 ? "s" : ""}
              </div>
              <ul className="mt-4 space-y-2">
                {p.feats.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-ink-soft">
                    <span className="text-leaf">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Btn variant={p.popular ? "solid" : "line"} className="mt-5 w-full">
                Choose {p.name}
              </Btn>
            </div>
          ))}
        </div>
      </div>

      {/* teams */}
      <Panel title="Team & seats">
        <div className="p-5">
          <div className="space-y-2">
            {seats.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-4 rounded-lg border border-line px-4 py-3"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink font-mono text-[12px] text-paper">
                  {s.name
                    .split(" ")
                    .map((w) => w[0])
                    .join("")
                    .slice(0, 2)}
                </span>
                <div className="flex-1">
                  <div className="text-sm font-medium">{s.name}</div>
                  <div className="font-mono text-[11px] text-ink-soft">{s.email}</div>
                </div>
                <span className="rounded-full border border-line px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-ink-soft">
                  {s.role}
                </span>
                {s.role !== "Owner" && (
                  <button
                    onClick={() => removeSeat(s.id)}
                    className="font-mono text-[11px] text-ink-soft hover:text-saffron-deep"
                  >
                    remove
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input
              placeholder="Name"
              value={newSeat.name}
              onChange={(e) => setNewSeat({ ...newSeat, name: e.target.value })}
              className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-saffron-deep"
            />
            <input
              placeholder="email@brand.in"
              value={newSeat.email}
              onChange={(e) => setNewSeat({ ...newSeat, email: e.target.value })}
              className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-saffron-deep"
            />
            <select
              value={newSeat.role}
              onChange={(e) => setNewSeat({ ...newSeat, role: e.target.value as Seat["role"] })}
              className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-saffron-deep"
            >
              {["Editor", "Reviewer"].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <Btn onClick={add}>Invite seat</Btn>
          </div>
        </div>
      </Panel>
    </div>
  );
}
