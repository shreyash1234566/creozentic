import type { ButtonHTMLAttributes, ReactNode } from "react";

export function PageHeader({
  kicker,
  title,
  desc,
  right,
}: {
  kicker: string;
  title: string;
  desc?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-saffron-deep">
          {kicker}
        </div>
        <h1 className="mt-2 font-display text-3xl font-medium tracking-[-0.02em] md:text-4xl">
          {title}
        </h1>
        {desc && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">{desc}</p>}
      </div>
      {right}
    </div>
  );
}

export function Panel({
  title,
  right,
  children,
  className = "",
}: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-line bg-card ${className}`}>
      {title && (
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">
            {title}
          </span>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "ghost" | "line" };

export function Btn({ variant = "solid", className = "", ...rest }: BtnProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40";
  const styles = {
    solid: "bg-saffron-deep text-paper hover:-translate-y-0.5",
    ghost: "text-ink hover:bg-paper-deep",
    line: "border border-ink text-ink hover:bg-ink hover:text-paper",
  }[variant];
  return <button className={`${base} ${styles} ${className}`} {...rest} />;
}

export function PhaseTag({ phase }: { phase: string }) {
  return (
    <span className="whitespace-nowrap rounded-full border border-line px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-soft">
      {phase}
    </span>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-card px-5 py-5">
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">{label}</div>
      <div className="mt-1 font-display text-3xl font-medium text-saffron-deep">{value}</div>
      {sub && <div className="mt-1 font-mono text-[10px] text-ink-soft">{sub}</div>}
    </div>
  );
}
