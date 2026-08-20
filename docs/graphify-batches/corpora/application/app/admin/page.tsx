export default function AdminPage() {
  const surfaces = [
    "Tenant operations",
    "Provider health",
    "Audit and security",
    "Billing controls",
    "Deployment evidence",
  ];
  return (
    <main className="min-h-screen bg-paper px-6 py-10 text-ink md:px-12">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="border-b border-line pb-6">
          <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-saffron-deep">
            Operations / Admin
          </div>
          <h1 className="mt-2 font-display text-4xl font-medium">Control plane.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Tenant-safe operational controls for provider health, audit, billing, deployment, and
            security review.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {surfaces.map((surface) => (
            <section key={surface} className="rounded-2xl border border-line bg-card p-5">
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
                Admin surface
              </div>
              <h2 className="mt-3 font-display text-2xl">{surface}</h2>
              <p className="mt-2 text-sm text-ink-soft">
                Requires an authorized administrator and records every action in the tenant audit
                stream.
              </p>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
