import { notFound } from "next/navigation";
import { db } from "../../../src/server/db";

export default async function WhiteLabelPortal({ params }: { params: Promise<{ slug: string }> }) {
  const config = await db.whiteLabelConfig.findFirst({
    where: { portalSlug: (await params).slug, enabled: true },
    select: { displayName: true, supportEmail: true, theme: true },
  });
  if (!config) notFound();
  const theme =
    config.theme && typeof config.theme === "object" && !Array.isArray(config.theme)
      ? (config.theme as Record<string, unknown>)
      : {};
  const accent = typeof theme.accent === "string" ? theme.accent : "#d1560f";
  return (
    <main className="min-h-screen bg-[#f7f2e9] px-6 py-16 text-[#241f1a]">
      <div className="mx-auto max-w-3xl">
        <p className="font-mono text-xs uppercase tracking-[0.18em]" style={{ color: accent }}>
          Client creative portal
        </p>
        <h1 className="mt-4 text-4xl font-semibold">{config.displayName}</h1>
        <p className="mt-4 max-w-xl text-sm leading-7 text-[#6d6255]">
          Submit briefs, review approved campaign packs, and collaborate with your creative team in
          one controlled workspace.
        </p>
        <div className="mt-10 rounded-2xl border border-[#ded4c8] bg-white/60 p-6">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-[#6d6255]">
            Portal status
          </p>
          <p className="mt-3 text-sm">
            This branded portal is enabled and protected by the workspace approval policy.
          </p>
          {config.supportEmail && (
            <p className="mt-4 text-xs text-[#6d6255]">Support: {config.supportEmail}</p>
          )}
        </div>
      </div>
    </main>
  );
}
