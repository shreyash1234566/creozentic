import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  motion,
  MotionConfig,
  AnimatePresence,
  useScroll,
  useTransform,
  useSpring,
  useMotionValue,
  useInView,
  animate,
  type Variants,
} from "motion/react";
import { SAMPLE_IMAGES, img } from "../data";

/* ────────────────────────── motion primitives ────────────────────────── */

const EASE = [0.16, 1, 0.3, 1] as const;

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { duration: 0.75, ease: EASE } },
};
const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};

function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className={className}
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      transition={{ delay }}
    >
      {children}
    </motion.div>
  );
}

/* magnetic, spring-driven button */
function Magnetic({
  children,
  onClick,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const x = useSpring(mx, { stiffness: 220, damping: 16, mass: 0.4 });
  const y = useSpring(my, { stiffness: 220, damping: 16, mass: 0.4 });
  const move = (e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    mx.set((e.clientX - (r.left + r.width / 2)) * 0.35);
    my.set((e.clientY - (r.top + r.height / 2)) * 0.35);
  };
  const reset = () => {
    mx.set(0);
    my.set(0);
  };
  return (
    <motion.button
      ref={ref}
      onClick={onClick}
      onPointerMove={move}
      onPointerLeave={reset}
      style={{ x, y }}
      whileTap={{ scale: 0.96 }}
      className={className}
    >
      {children}
    </motion.button>
  );
}

/* 3D tilt card with spring physics */
function TiltCard({
  children,
  className = "",
  max = 9,
}: {
  children: ReactNode;
  className?: string;
  max?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const rx = useSpring(useMotionValue(0), { stiffness: 150, damping: 15 });
  const ry = useSpring(useMotionValue(0), { stiffness: 150, damping: 15 });
  const move = (e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    rx.set(((e.clientY - r.top) / r.height - 0.5) * -max);
    ry.set(((e.clientX - r.left) / r.width - 0.5) * max);
  };
  const reset = () => {
    rx.set(0);
    ry.set(0);
  };
  return (
    <div className="h-full" style={{ perspective: 1200 }}>
      <motion.div
        ref={ref}
        onPointerMove={move}
        onPointerLeave={reset}
        style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}
        className={`h-full ${className}`}
      >
        {children}
      </motion.div>
    </div>
  );
}

/* count-up on scroll */
function Counter({
  to,
  suffix = "",
  prefix = "",
  dur = 1.6,
}: {
  to: number;
  suffix?: string;
  prefix?: string;
  dur?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const c = animate(0, to, { duration: dur, ease: EASE, onUpdate: setVal });
    return () => c.stop();
  }, [inView, to, dur]);
  const display = to % 1 === 0 ? Math.round(val).toString() : val.toFixed(1);
  return (
    <span ref={ref}>
      {prefix}
      {display}
      {suffix}
    </span>
  );
}

/* rotating headline word */
function RotatingWord({ words }: { words: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % words.length), 2400);
    return () => clearInterval(id);
  }, [words.length]);
  return (
    <span className="relative inline-grid" style={{ perspective: 600 }}>
      <AnimatePresence mode="wait">
        <motion.span
          key={i}
          className="col-start-1 row-start-1 italic text-saffron-deep"
          initial={{ opacity: 0, y: 16, rotateX: -50 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          exit={{ opacity: 0, y: -16, rotateX: 50 }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          {words[i]}
        </motion.span>
      </AnimatePresence>
      {/* invisible sizer keeps layout stable to the widest word */}
      <span className="invisible col-start-1 row-start-1 italic" aria-hidden>
        {words.reduce((a, b) => (a.length > b.length ? a : b))}
      </span>
    </span>
  );
}

/* ────────────────────────── data ────────────────────────── */

const MODES = [
  {
    route: "productlock",
    name: "Product-Lock Studio",
    job: "D2C & business",
    line: "Catalogue product → controlled scenes, product truth intact.",
    glyph: "◈",
  },
  {
    route: "batch",
    name: "Brand Campaign System",
    job: "Agencies",
    line: "One concept → every post, story, reel and market variant.",
    glyph: "▦",
  },
  {
    route: "video",
    name: "UGC Ad Studio",
    job: "Performance",
    line: "Brief → hooks, script, captions and platform exports.",
    glyph: "▷",
  },
  {
    route: "composer",
    name: "Authentic Edit",
    job: "Creators",
    line: "Real source clip → finished, native-looking content.",
    glyph: "⊞",
  },
];

const LOOP = ["Brief", "Brand", "Variants", "QA gate", "Approve", "Export", "Perform"];
const TRUST = [
  "Kosmic Furniture",
  "Woodpeel",
  "diamanto.in",
  "Realzentic",
  "Furzentic",
  "Kia",
  "Studio Marg",
];

const PLANS = [
  {
    name: "Starter",
    inr: "1,499",
    credits: "1,000",
    seats: "1 seat",
    feats: ["1 brand", "Image + edit", "WhatsApp delivery"],
  },
  {
    name: "Studio",
    inr: "4,999",
    credits: "4,000",
    seats: "3 seats",
    feats: ["5 brands", "Batch + Composer", "Model comparison", "Client review links"],
    popular: true,
  },
  {
    name: "Agency",
    inr: "14,999",
    credits: "14,000",
    seats: "10 seats",
    feats: ["Unlimited brands", "Video credits", "Localization", "White-label"],
  },
];

// subtle film grain overlay (SVG turbulence)
const NOISE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E\")";

type Persona = {
  tab: string;
  role: string;
  name: string;
  quote: string;
  bullets: { label: string; route: string }[];
  img: string;
  g1: string;
  g2: string;
};

const PERSONAS: Persona[] = [
  {
    tab: "“I run a D2C brand”",
    role: "Founder · furniture & décor",
    name: "Aarav Mehta · Kosmic Furniture",
    quote:
      "My catalogue shots used to sit in a warehouse folder. Now the exact sofa — same fabric, same legs — drops into ten lifestyle scenes, and nothing about the product quietly changes.",
    bullets: [
      { label: "Product-Lock Studio keeps the real product intact", route: "productlock" },
      { label: "Integrity gate blocks silent edits before publish", route: "productlock" },
      { label: "Catalogue + locked claims per SKU", route: "assets" },
    ],
    img: "photo-1676989880361-091e12efc056",
    g1: "#e79a1f",
    g2: "#d1560f",
  },
  {
    tab: "“I scale an agency”",
    role: "Creative director · 12 brands",
    name: "Sara Kapoor · Studio Marg",
    quote:
      "We manage content across a dozen clients. One concept now becomes every post, story and reel — on-brand for each account — without me hiring three more designers to keep up.",
    bullets: [
      { label: "Brand Campaign System fans one idea into every format", route: "batch" },
      { label: "Per-client brand memory & guardrails", route: "brand" },
      { label: "Shareable client review & approval links", route: "review" },
    ],
    img: "photo-1580489944761-15a19d654956",
    g1: "#2e3a6e",
    g2: "#a6410a",
  },
  {
    tab: "“I own the brand”",
    role: "Head of marketing · multi-market",
    name: "Neha Rao · Realzentic",
    quote:
      "Before, every market variant was a fresh fire drill. Now the same campaign ships in Hindi, Tamil and Hinglish — consistent, on-message — and I approve it from WhatsApp.",
    bullets: [
      { label: "Localization into Indian languages & RTL", route: "localization" },
      { label: "Character & product consistency across a set", route: "consistency" },
      { label: "WhatsApp, Drive & Meta delivery", route: "connectors" },
    ],
    img: "photo-1759215524600-f5e5759a289f",
    g1: "#4a6b3f",
    g2: "#e79a1f",
  },
];

function persona_img(id: string, w = 800, h = 900) {
  return `https://images.unsplash.com/${id}?crop=entropy&cs=tinysrgb&fit=crop&fm=jpg&w=${w}&h=${h}&q=80`;
}

const GATE_CHECKS = [
  { dim: "Product truth", note: "OCR + pixel-diff · no silent changes", v: "pass" },
  { dim: "Brand rules", note: "palette, logo, type all matched", v: "pass" },
  { dim: "Claim accuracy", note: "no unverifiable superlatives", v: "pass" },
  { dim: "Composition", note: "9:16 safe-area respected", v: "warn" },
  { dim: "Rights & export", note: "model release on file", v: "pass" },
] as const;

/* ────────────────────────── persona switcher ────────────────────────── */

function PersonaSwitcher({ onEnter }: { onEnter: (view?: string) => void }) {
  const [i, setI] = useState(0);
  const p = PERSONAS[i];

  return (
    <section className="relative overflow-hidden py-24">
      {/* shifting gradient ground */}
      <motion.div
        className="absolute inset-0 -z-20"
        animate={{
          background: `radial-gradient(120% 120% at 50% 0%, ${p.g1}33 0%, ${p.g2}22 38%, var(--color-paper) 72%)`,
        }}
        transition={{ duration: 0.9, ease: EASE }}
      />
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.5] mix-blend-multiply"
        style={{ backgroundImage: NOISE }}
      />

      <div className="mx-auto max-w-6xl px-5 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-saffron-deep">
            Built for how you work
          </div>
          <h2 className="mt-3 font-display text-4xl font-medium tracking-[-0.02em] lg:text-5xl">
            One engine, three ways to <span className="italic text-saffron-deep">win</span>.
          </h2>
        </Reveal>

        {/* segmented tabs */}
        <div className="mx-auto mt-10 grid max-w-4xl gap-3 sm:grid-cols-3">
          {PERSONAS.map((persona, idx) => {
            const active = idx === i;
            return (
              <button
                key={persona.tab}
                onClick={() => setI(idx)}
                className={`relative rounded-2xl border px-5 py-4 text-center font-display text-lg font-medium transition-colors ${
                  active
                    ? "border-transparent text-paper"
                    : "border-line bg-card/60 text-ink-soft hover:text-ink"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="persona-pill"
                    className="absolute inset-0 rounded-2xl bg-ink"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <span className="relative z-10">{persona.tab}</span>
              </button>
            );
          })}
        </div>

        {/* content card */}
        <div className="mx-auto mt-6 max-w-5xl overflow-hidden rounded-3xl border border-line bg-ink text-paper shadow-2xl shadow-ink/20">
          <div className="grid md:grid-cols-[1.15fr_1fr]">
            {/* quote side */}
            <div className="flex flex-col justify-between p-8 lg:p-10">
              <AnimatePresence mode="wait">
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -14 }}
                  transition={{ duration: 0.45, ease: EASE }}
                >
                  <span className="font-display text-5xl leading-none text-marigold">“</span>
                  <blockquote className="mt-2 font-display text-2xl font-medium leading-snug tracking-[-0.01em] lg:text-[1.7rem]">
                    {p.quote}
                  </blockquote>
                  <div className="mt-6 font-mono text-[11px] uppercase tracking-[0.14em] text-paper/60">
                    {p.name}
                  </div>
                  <div className="font-mono text-[11px] text-marigold">{p.role}</div>

                  <ul className="mt-6 space-y-2">
                    {p.bullets.map((b) => (
                      <li key={b.label}>
                        <button
                          onClick={() => onEnter(b.route)}
                          className="group flex w-full items-center gap-3 rounded-xl border border-paper/12 bg-paper/5 px-4 py-3 text-left text-sm transition-colors hover:border-marigold/50 hover:bg-paper/10"
                        >
                          <span className="text-marigold">→</span>
                          <span className="flex-1">{b.label}</span>
                          <span className="font-mono text-[10px] uppercase tracking-wide text-paper/40 transition-colors group-hover:text-paper/80">
                            open
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* portrait side */}
            <div className="relative min-h-[340px] overflow-hidden bg-paper-deep md:min-h-full">
              <AnimatePresence mode="popLayout">
                <motion.img
                  key={i}
                  src={persona_img(p.img)}
                  alt={p.name}
                  className="absolute inset-0 h-full w-full object-cover"
                  initial={{ opacity: 0, scale: 1.08 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.04 }}
                  transition={{ duration: 0.6, ease: EASE }}
                />
              </AnimatePresence>
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/60 via-transparent to-transparent md:bg-gradient-to-r md:from-ink/70 md:via-ink/10 md:to-transparent" />
              <motion.div
                key={`badge-${i}`}
                className="absolute bottom-5 right-5 rounded-full px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide text-ink"
                style={{ background: p.g1 }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                real customer outcome
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────── UGC / social ads showcase ────────────────────────── */

const HOOKS = [
  {
    tag: "POV hook",
    line: "POV: your ₹40k sofa arrives and the room finally makes sense.",
    ctr: "4.8%",
    img: 0,
    likes: 12400,
    cap: "Kadam 3-seater · boucle oat",
  },
  {
    tag: "Problem → fix",
    line: "Small living room? This modular set was built for it.",
    ctr: "3.9%",
    img: 2,
    likes: 8700,
    cap: "Modular · fits 9×11 ft",
  },
  {
    tag: "Social proof",
    line: '"Looks like a ₹2L studio shoot." — 1,900 reviews.',
    ctr: "5.6%",
    img: 4,
    likes: 21300,
    cap: "Rated 4.8 · free delivery",
  },
];

const PLATFORMS = ["Instagram Reels", "YouTube Shorts", "Meta Ads", "WhatsApp Status"];

function UgcShowcase({ onEnter }: { onEnter: (view?: string) => void }) {
  const [i, setI] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-120px" });
  useEffect(() => {
    if (!inView) return;
    const id = setInterval(() => setI((n) => (n + 1) % HOOKS.length), 3200);
    return () => clearInterval(id);
  }, [inView]);
  const h = HOOKS[i];

  return (
    <section ref={ref} className="relative overflow-hidden bg-ink py-24 text-paper">
      {/* ambient glow */}
      <div
        className="anim-drift pointer-events-none absolute -right-20 top-10 h-96 w-96 rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(circle, #e79a1f, transparent 70%)" }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.25] mix-blend-overlay"
        style={{ backgroundImage: NOISE }}
      />

      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 lg:grid-cols-[1fr_420px] lg:px-8">
        {/* copy + hooks */}
        <div>
          <Reveal>
            <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-marigold">
              Social-first · AI UGC ads
            </div>
            <h2 className="mt-3 font-display text-4xl font-medium tracking-[-0.02em] lg:text-5xl">
              Thumb-stopping ads, <span className="italic text-marigold">without the shoot.</span>
            </h2>
            <p className="mt-4 max-w-lg text-paper/70">
              Describe the product and the offer. The UGC Ad Studio writes the hooks, storyboards
              the shots, adds captions, and exports native-looking vertical video for every feed —
              with consent and product truth built in.
            </p>
          </Reveal>

          {/* rotating hook cards */}
          <div className="mt-8 space-y-2">
            {HOOKS.map((hook, idx) => {
              const active = idx === i;
              return (
                <button
                  key={hook.tag}
                  onClick={() => setI(idx)}
                  className={`flex w-full items-center gap-4 rounded-2xl border px-4 py-3 text-left transition-colors ${
                    active
                      ? "border-marigold/60 bg-paper/10"
                      : "border-paper/12 bg-paper/[0.03] hover:bg-paper/5"
                  }`}
                >
                  <span
                    className={`font-mono text-[10px] uppercase tracking-wide ${active ? "text-marigold" : "text-paper/40"}`}
                  >
                    {String.fromCharCode(65 + idx)}
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-medium leading-snug">{hook.line}</span>
                    <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-wide text-paper/40">
                      {hook.tag}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 text-right font-mono text-[11px] ${active ? "text-leaf" : "text-paper/40"}`}
                  >
                    <span className="block font-display text-lg font-medium leading-none">
                      {hook.ctr}
                    </span>
                    <span className="text-[9px] uppercase">pred. CTR</span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* platforms + CTA */}
          <div className="mt-7 flex flex-wrap items-center gap-2">
            {PLATFORMS.map((p) => (
              <span
                key={p}
                className="rounded-full border border-paper/15 px-3 py-1 font-mono text-[10px] uppercase tracking-wide text-paper/60"
              >
                {p}
              </span>
            ))}
          </div>
          <Magnetic
            onClick={() => onEnter("video")}
            className="mt-7 rounded-full bg-marigold px-6 py-3 font-medium text-ink"
          >
            Open UGC Ad Studio →
          </Magnetic>
        </div>

        {/* phone mockup */}
        <Reveal delay={0.1}>
          <div className="mx-auto" style={{ perspective: 1400 }}>
            <motion.div
              className="relative mx-auto aspect-[9/19] w-[280px] rounded-[2.4rem] border-4 border-ink bg-ink p-2 shadow-2xl"
              style={{ transformStyle: "preserve-3d" }}
              initial={{ rotateY: 16, rotateX: 6, opacity: 0 }}
              whileInView={{ rotateY: 10, rotateX: 4, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.9, ease: EASE }}
            >
              {/* notch */}
              <div className="absolute left-1/2 top-2.5 z-20 h-5 w-24 -translate-x-1/2 rounded-full bg-ink" />
              <div className="relative h-full w-full overflow-hidden rounded-[2rem] bg-paper-deep">
                <AnimatePresence mode="popLayout">
                  <motion.img
                    key={i}
                    src={img(SAMPLE_IMAGES[h.img], 400, 840)}
                    alt="UGC ad frame"
                    className="absolute inset-0 h-full w-full object-cover"
                    initial={{ opacity: 0, scale: 1.08 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.6, ease: EASE }}
                  />
                </AnimatePresence>

                {/* scrims */}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/80 via-transparent to-ink/40" />

                {/* platform badge + live pill */}
                <div className="absolute left-3 top-4 z-10 flex items-center gap-2">
                  <span className="rounded-full bg-paper/90 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-ink">
                    Reels · 9:16
                  </span>
                  <span className="flex items-center gap-1 rounded-full bg-saffron-deep px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-paper">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-paper" /> live
                  </span>
                </div>

                {/* engagement rail */}
                <div className="absolute bottom-24 right-3 z-10 flex flex-col items-center gap-4 text-paper">
                  {[
                    { g: "♥", n: h.likes },
                    { g: "💬", n: Math.round(h.likes * 0.08) },
                    { g: "↗", n: Math.round(h.likes * 0.15) },
                  ].map((e, k) => (
                    <div key={k} className="flex flex-col items-center">
                      <span className="text-lg drop-shadow">{e.g}</span>
                      <span className="font-mono text-[9px] tabular-nums">
                        {(e.n / 1000).toFixed(1)}k
                      </span>
                    </div>
                  ))}
                </div>

                {/* caption / hook */}
                <div className="absolute inset-x-0 bottom-0 z-10 p-4">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.4, ease: EASE }}
                    >
                      <span className="font-mono text-[9px] uppercase tracking-wide text-marigold">
                        Hook {String.fromCharCode(65 + i)}
                      </span>
                      <p className="mt-1 font-display text-[15px] font-medium leading-snug text-paper drop-shadow">
                        {h.line}
                      </p>
                      <p className="mt-1.5 font-mono text-[9px] text-paper/60">
                        {h.cap} · ✓ product-locked
                      </p>
                    </motion.div>
                  </AnimatePresence>
                  {/* progress bar */}
                  <div className="mt-3 h-0.5 w-full overflow-hidden rounded-full bg-paper/20">
                    <motion.div
                      key={i}
                      className="h-full bg-marigold"
                      initial={{ width: "0%" }}
                      animate={{ width: "100%" }}
                      transition={{ duration: 3.2, ease: "linear" }}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ────────────────────────── live gate showcase ────────────────────────── */

function LiveGate() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-120px" });
  const [step, setStep] = useState(-1);
  useEffect(() => {
    if (!inView) return;
    const timers = GATE_CHECKS.map((_, i) => setTimeout(() => setStep(i), 500 + i * 620));
    return () => timers.forEach(clearTimeout);
  }, [inView]);
  const done = step >= GATE_CHECKS.length - 1;
  const score = Math.min(96, 78 + (step + 1) * 4);

  return (
    <section ref={ref} className="mx-auto max-w-6xl px-5 py-24 lg:px-8">
      <Reveal className="max-w-2xl">
        <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-saffron-deep">
          The reliability engine
        </div>
        <h2 className="mt-3 font-display text-4xl font-medium tracking-[-0.02em]">
          Watch every asset get graded before a human sees it.
        </h2>
        <p className="mt-3 text-ink-soft">
          No black box. Each output runs a professional-output scorecard — beautiful-but-wrong never
          reaches your feed.
        </p>
      </Reveal>

      <div className="mt-12 grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <Reveal>
          <div style={{ perspective: 1400 }}>
            <motion.div
              className="relative mx-auto max-w-sm"
              style={{ transformStyle: "preserve-3d" }}
              initial={{ rotateY: -14, rotateX: 6, opacity: 0 }}
              whileInView={{ rotateY: -9, rotateX: 4, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.9, ease: EASE }}
            >
              <div className="relative overflow-hidden rounded-2xl border border-line bg-card shadow-2xl shadow-ink/10">
                <img
                  src={img(SAMPLE_IMAGES[2], 400, 500)}
                  alt="asset under integrity review"
                  className="aspect-[4/5] w-full bg-paper-deep object-cover"
                />
                {!done && (
                  <div
                    className="anim-scan pointer-events-none absolute inset-x-0 h-16"
                    style={{
                      background: "linear-gradient(180deg, transparent, #e79a1f88, transparent)",
                    }}
                  />
                )}
                <div className="pointer-events-none absolute inset-0 border-2 border-marigold/25" />
                <motion.div
                  className={`absolute left-3 top-3 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-paper ${done ? "bg-leaf" : "bg-ink/80"}`}
                  animate={{ scale: done ? [1, 1.08, 1] : 1 }}
                  transition={{ duration: 0.5 }}
                >
                  {done ? "● publishable" : "◌ scanning…"}
                </motion.div>
              </div>
              <motion.div
                className="absolute -right-6 top-8 rounded-2xl border border-line bg-paper px-4 py-3 shadow-xl"
                style={{ transformStyle: "preserve-3d", translateZ: 60 }}
                animate={{ y: [0, -12, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              >
                <div className="font-display text-3xl font-medium text-leaf">{score}</div>
                <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-soft">
                  pro score
                </div>
              </motion.div>
              <div className="absolute -left-4 bottom-10">
                <span className="anim-pulse-ring absolute inset-0 rounded-full bg-saffron-deep/40" />
                <span className="relative block h-3 w-3 rounded-full bg-saffron-deep" />
              </div>
            </motion.div>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="rounded-2xl border border-line bg-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">
                Professional-output scorecard
              </span>
              <span className="font-mono text-[11px] text-ink-soft">
                {Math.max(0, step + 1)}/{GATE_CHECKS.length}
              </span>
            </div>
            <div className="space-y-2">
              {GATE_CHECKS.map((c, i) => {
                const active = i <= step;
                const tone = c.v === "warn" ? "text-marigold" : "text-leaf";
                return (
                  <motion.div
                    key={c.dim}
                    className="flex items-center gap-3 rounded-xl border px-4 py-3"
                    animate={{
                      opacity: active ? 1 : 0.35,
                      borderColor: active ? "var(--color-line)" : "transparent",
                      backgroundColor: active ? "var(--color-paper)" : "transparent",
                    }}
                    transition={{ duration: 0.4 }}
                  >
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full bg-paper-deep font-mono text-[12px] ${active ? tone : "text-ink-soft"}`}
                    >
                      {active ? (c.v === "warn" ? "△" : "✓") : "·"}
                    </span>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{c.dim}</div>
                      <div className="font-mono text-[10px] text-ink-soft">{c.note}</div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
            <motion.div
              className={`mt-4 rounded-xl px-4 py-3 text-sm font-medium ${done ? "bg-leaf/10 text-leaf" : "bg-paper-deep text-ink-soft"}`}
              animate={{ opacity: 1 }}
            >
              {done ? "✓ Passed — ready for human approval & publish." : "Running checks…"}
            </motion.div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ────────────────────────── landing ────────────────────────── */

export default function Landing({ onEnter }: { onEnter: (view?: string) => void }) {
  const heroRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // page scroll progress bar
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.3 });

  // hero scroll parallax
  const { scrollYProgress: heroP } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroVisualY = useTransform(heroP, [0, 1], [0, 120]);
  const heroCopyY = useTransform(heroP, [0, 1], [0, 60]);
  const heroFade = useTransform(heroP, [0, 0.8], [1, 0]);
  const glowY = useTransform(heroP, [0, 1], [0, -80]);

  // hero pointer tilt (spring)
  const tiltX = useSpring(useMotionValue(0), { stiffness: 120, damping: 14 });
  const tiltY = useSpring(useMotionValue(0), { stiffness: 120, damping: 14 });
  const onHeroMove = (e: React.PointerEvent) => {
    const r = heroRef.current?.getBoundingClientRect();
    if (!r) return;
    tiltX.set(((e.clientY - r.top) / r.height - 0.5) * -10);
    tiltY.set(((e.clientX - r.left) / r.width - 0.5) * 14);
  };
  const onHeroLeave = () => {
    tiltX.set(0);
    tiltY.set(0);
  };

  return (
    <MotionConfig reducedMotion="user">
      <div ref={rootRef} className="min-h-screen overflow-x-hidden bg-paper text-ink">
        {/* scroll progress */}
        <motion.div
          className="fixed inset-x-0 top-0 z-[60] h-0.5 origin-left bg-saffron-deep"
          style={{ scaleX: progress }}
        />

        {/* nav */}
        <motion.header
          className="sticky top-0 z-50 border-b border-line/70 bg-paper/80 backdrop-blur-md"
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, ease: EASE }}
        >
          <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 lg:px-8">
            <button onClick={() => onEnter("overview")} className="flex items-baseline gap-2">
              <span className="font-display text-xl font-semibold tracking-[-0.02em]">
                Creozentic
              </span>
              <span className="hidden font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft sm:block">
                by Autozentic
              </span>
            </button>
            <nav className="hidden items-center gap-7 font-mono text-[12px] uppercase tracking-[0.1em] text-ink-soft md:flex">
              <a href="#modes" className="transition-colors hover:text-ink">
                Product
              </a>
              <a href="#how" className="transition-colors hover:text-ink">
                How it works
              </a>
              <a href="#pricing" className="transition-colors hover:text-ink">
                Pricing
              </a>
            </nav>
            <div className="flex items-center gap-3">
              <button
                onClick={() => onEnter("overview")}
                className="hidden font-mono text-[12px] uppercase tracking-[0.1em] text-ink-soft transition-colors hover:text-ink sm:block"
              >
                Sign in
              </button>
              <Magnetic
                onClick={() => onEnter("productlock")}
                className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper"
              >
                Launch studio
              </Magnetic>
            </div>
          </div>
        </motion.header>

        {/* hero */}
        <section
          ref={heroRef}
          onPointerMove={onHeroMove}
          onPointerLeave={onHeroLeave}
          className="relative mx-auto grid max-w-6xl gap-12 px-5 pb-28 pt-16 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:px-8 lg:pt-24"
        >
          <motion.div
            className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
            style={{ y: glowY }}
          >
            <div
              className="anim-drift absolute -left-24 -top-24 h-96 w-96 rounded-full opacity-50 blur-3xl"
              style={{ background: "radial-gradient(circle, #e79a1f66, transparent 70%)" }}
            />
            <div
              className="anim-drift absolute -right-16 top-40 h-96 w-96 rounded-full opacity-40 blur-3xl"
              style={{
                background: "radial-gradient(circle, #d1560f55, transparent 70%)",
                animationDelay: "4s",
              }}
            />
          </motion.div>

          {/* copy */}
          <motion.div
            style={{ y: heroCopyY, opacity: heroFade }}
            variants={stagger}
            initial="hidden"
            animate="show"
          >
            <motion.div variants={fadeUp}>
              <div className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-saffron-deep">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="anim-pulse-ring absolute inset-0 rounded-full bg-saffron-deep/50" />
                  <span className="relative h-1.5 w-1.5 rounded-full bg-saffron-deep" />
                </span>
                Creative reliability system
              </div>
            </motion.div>
            <motion.h1
              variants={fadeUp}
              className="mt-5 font-display text-[2.7rem] font-medium leading-[1.03] tracking-[-0.02em] sm:text-6xl"
            >
              From brief to{" "}
              <RotatingWord words={["approved", "on-brand", "published", "reliable"]} />
              <br className="hidden sm:block" /> campaign packs — in minutes.
            </motion.h1>
            <motion.p
              variants={fadeUp}
              className="mt-5 max-w-xl text-lg leading-relaxed text-ink-soft"
            >
              Creozentic turns your rough idea and product assets into platform-ready creative that
              respects your brand and preserves product truth. No prompt engineering, no confusing
              model menus, no uncontrolled cost.
            </motion.p>
            <motion.div variants={fadeUp} className="mt-8 flex flex-wrap items-center gap-3">
              <Magnetic
                onClick={() => onEnter("productlock")}
                className="group rounded-full bg-saffron-deep px-6 py-3 font-medium text-paper shadow-lg shadow-saffron-deep/20"
              >
                Start free{" "}
                <span className="ml-2 inline-block transition-transform group-hover:translate-x-1">
                  →
                </span>
              </Magnetic>
              <Magnetic
                onClick={() => onEnter("overview")}
                className="rounded-full border border-ink px-6 py-3 font-medium"
              >
                See how it works
              </Magnetic>
            </motion.div>
            <motion.div
              variants={fadeUp}
              className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px] text-ink-soft"
            >
              <span>✓ Product-truth guaranteed</span>
              <span>✓ Cost shown before work</span>
              <span>✓ Human approval before publish</span>
            </motion.div>
          </motion.div>

          {/* 3D hero visual */}
          <motion.div
            style={{ y: heroVisualY, opacity: heroFade }}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.15 }}
          >
            <div style={{ perspective: 1400 }}>
              <motion.div
                className="relative mx-auto max-w-md"
                style={{ rotateX: tiltX, rotateY: tiltY, transformStyle: "preserve-3d" }}
              >
                <div
                  className="overflow-hidden rounded-2xl border border-line bg-card shadow-2xl shadow-ink/10"
                  style={{ transformStyle: "preserve-3d", transform: "translateZ(40px)" }}
                >
                  <div className="flex items-center gap-2 border-b border-line px-4 py-3">
                    <span className="h-2.5 w-2.5 rounded-full bg-saffron-deep" />
                    <span className="h-2.5 w-2.5 rounded-full bg-marigold" />
                    <span className="h-2.5 w-2.5 rounded-full bg-leaf" />
                    <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
                      product-lock · run #1042
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 p-3">
                    {SAMPLE_IMAGES.slice(0, 4).map((id, i) => (
                      <motion.img
                        key={id}
                        src={img(id, 240, 300)}
                        alt="generated variant"
                        className="aspect-[4/5] rounded-lg bg-paper-deep object-cover"
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 + i * 0.12, duration: 0.6, ease: EASE }}
                      />
                    ))}
                  </div>
                  <div className="flex items-center justify-between border-t border-line px-4 py-3">
                    <span className="font-mono text-[10px] uppercase tracking-wide text-leaf">
                      ● integrity gate passed
                    </span>
                    <span className="font-mono text-[10px] text-ink-soft">4 variants · 4 cr</span>
                  </div>
                </div>

                <motion.div
                  className="absolute -left-8 top-16 rounded-2xl border border-line bg-paper px-4 py-3 shadow-xl"
                  style={{ transformStyle: "preserve-3d", translateZ: 90 }}
                  animate={{ y: [0, -14, 0] }}
                  transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                >
                  <div className="font-display text-3xl font-medium text-leaf">96</div>
                  <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-soft">
                    pro score
                  </div>
                </motion.div>

                <motion.div
                  className="absolute -right-6 bottom-10 rounded-2xl border border-line bg-ink px-4 py-3 text-paper shadow-xl"
                  style={{ transformStyle: "preserve-3d", translateZ: 110 }}
                  animate={{ y: [0, -20, 0] }}
                  transition={{ duration: 7.5, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
                >
                  <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-marigold">
                    cost first
                  </div>
                  <div className="mt-0.5 font-display text-xl font-medium">
                    ₹86 <span className="font-sans text-xs font-normal text-paper/60">/pack</span>
                  </div>
                </motion.div>

                <div
                  className="anim-spin-slow pointer-events-none absolute -inset-10 -z-10 rounded-full border border-dashed border-line/60"
                  style={{ transformStyle: "preserve-3d", transform: "translateZ(-40px)" }}
                />
              </motion.div>
            </div>
          </motion.div>
        </section>

        {/* trust marquee */}
        <section className="border-y border-line bg-card py-6">
          <div className="mx-auto max-w-6xl px-5 lg:px-8">
            <p className="mb-4 text-center font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">
              Built for catalogue-first Indian brands & agencies
            </p>
            <div className="relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
              <div className="anim-marquee flex w-max gap-12">
                {[...TRUST, ...TRUST].map((t, i) => (
                  <span key={i} className="font-display text-xl font-medium text-ink-soft/70">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* stats */}
        <section className="mx-auto max-w-6xl px-5 py-24 lg:px-8">
          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
            className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4"
          >
            {[
              { v: <Counter to={74} suffix="%" />, l: "First-run acceptance", s: "target ≥ 70%" },
              { v: <Counter to={86} prefix="₹" />, l: "Cost / approved pack", s: "margin guarded" },
              {
                v: <Counter to={10} suffix=" min" />,
                l: "Brief → delivered pack",
                s: "not a studio shoot",
              },
              { v: <Counter to={4} suffix="×" />, l: "Manual tools removed", s: "one workflow" },
            ].map((s) => (
              <motion.div key={s.l} variants={fadeUp} className="bg-card px-5 py-8 text-center">
                <div className="font-display text-4xl font-medium text-saffron-deep">{s.v}</div>
                <div className="mt-1 text-sm font-medium">{s.l}</div>
                <div className="font-mono text-[10px] text-ink-soft">{s.s}</div>
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* modes */}
        <section id="modes" className="mx-auto max-w-6xl px-5 py-10 lg:px-8">
          <Reveal className="max-w-2xl">
            <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-saffron-deep">
              Start from an outcome
            </div>
            <h2 className="mt-3 font-display text-4xl font-medium tracking-[-0.02em]">
              Not a blank canvas. A finished result.
            </h2>
            <p className="mt-3 text-ink-soft">
              Pick the job to be done — the router picks the model. Four studios, one reliable
              engine underneath.
            </p>
          </Reveal>
          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            className="mt-12 grid gap-4 md:grid-cols-2"
          >
            {MODES.map((m) => (
              <motion.div key={m.route} variants={fadeUp}>
                <TiltCard>
                  <button
                    onClick={() => onEnter(m.route)}
                    className="group flex h-full w-full flex-col justify-between rounded-2xl border border-line bg-card p-7 text-left transition-colors hover:border-saffron-deep hover:shadow-xl hover:shadow-ink/5"
                  >
                    <div style={{ transform: "translateZ(35px)" }}>
                      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-paper-deep text-lg text-saffron-deep">
                        {m.glyph}
                      </div>
                      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-saffron-deep">
                        {m.job}
                      </span>
                      <h3 className="mt-2 font-display text-2xl font-medium">{m.name}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-ink-soft">{m.line}</p>
                    </div>
                    <span
                      className="mt-6 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide text-ink transition-transform group-hover:translate-x-1"
                      style={{ transform: "translateZ(35px)" }}
                    >
                      Open studio →
                    </span>
                  </button>
                </TiltCard>
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* persona switcher */}
        <PersonaSwitcher onEnter={onEnter} />

        {/* UGC / social ads showcase */}
        <UgcShowcase onEnter={onEnter} />

        {/* live integrity gate */}
        <LiveGate />

        {/* mid CTA strip */}
        <section className="mx-auto max-w-6xl px-5 lg:px-8">
          <Reveal>
            <div className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-line bg-ink px-6 py-6 text-paper sm:flex-row lg:px-10">
              <p className="font-display text-xl font-medium sm:text-2xl">
                Reliable creative, priced in credits — see your first pack quoted before it runs.
              </p>
              <Magnetic
                onClick={() => onEnter("productlock")}
                className="shrink-0 rounded-full bg-marigold px-6 py-3 font-medium text-ink"
              >
                Generate your first pack →
              </Magnetic>
            </div>
          </Reveal>
        </section>

        {/* core loop */}
        <section id="how" className="mx-auto max-w-6xl px-5 py-24 lg:px-8">
          <Reveal>
            <div className="rounded-3xl border border-line bg-ink px-6 py-12 text-paper lg:px-12">
              <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-marigold">
                The core loop
              </div>
              <h2 className="mt-3 max-w-2xl font-display text-3xl font-medium tracking-[-0.02em] lg:text-4xl">
                Every feature improves one measurable step — nothing is a magic black box.
              </h2>
              <motion.div
                variants={stagger}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true }}
                className="mt-10 flex flex-wrap items-center gap-y-4"
              >
                {LOOP.map((s, i) => (
                  <motion.div key={s} variants={fadeUp} className="flex items-center">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full border border-paper/25 font-mono text-[12px] text-marigold">
                        {i + 1}
                      </span>
                      <span className="font-medium">{s}</span>
                    </div>
                    {i < LOOP.length - 1 && <span className="mx-3 text-paper/30">→</span>}
                  </motion.div>
                ))}
              </motion.div>
            </div>
          </Reveal>
        </section>

        {/* feature bento */}
        <section className="mx-auto max-w-6xl px-5 py-10 lg:px-8">
          <Reveal>
            <h2 className="max-w-2xl font-display text-4xl font-medium tracking-[-0.02em]">
              Why teams trust the output, not just the render.
            </h2>
          </Reveal>
          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            className="mt-12 grid gap-4 lg:grid-cols-3"
          >
            <motion.div variants={fadeUp} className="lg:col-span-2">
              <TiltCard max={5}>
                <div className="flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-line bg-card p-8">
                  <div style={{ transform: "translateZ(30px)" }}>
                    <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-saffron-deep">
                      Product truth is an invariant
                    </div>
                    <h3 className="mt-3 font-display text-2xl font-medium">
                      The real product, its text and colours never silently change.
                    </h3>
                    <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-soft">
                      Product-lock mode segments the real product, generates the scene around it,
                      then runs OCR and image-difference checks. A critical integrity failure blocks
                      publishing — beautiful but wrong never ships.
                    </p>
                  </div>
                  <div className="mt-6 grid grid-cols-3 gap-2">
                    {SAMPLE_IMAGES.slice(0, 3).map((id) => (
                      <img
                        key={id}
                        src={img(id, 240, 180)}
                        alt="product variant"
                        className="aspect-[4/3] rounded-lg bg-paper-deep object-cover"
                      />
                    ))}
                  </div>
                </div>
              </TiltCard>
            </motion.div>
            <motion.div variants={fadeUp}>
              <div className="flex h-full flex-col justify-center rounded-2xl border border-line bg-card p-8">
                <div className="font-display text-5xl font-medium text-leaf">
                  <Counter to={96} />
                </div>
                <div className="mt-1 font-mono text-[11px] uppercase tracking-wide text-ink-soft">
                  professional score
                </div>
                <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                  Every asset is graded across product truth, brand rules, claims, composition and
                  rights before a human ever sees it.
                </p>
              </div>
            </motion.div>
            {[
              {
                k: "Cost shown first",
                t: "Credits, provider cost and ETA quoted before any work starts. Margin is guarded per approved pack.",
              },
              {
                k: "Human control",
                t: "Draft → review → approval → publish. Comment on a region or frame; every decision is audited.",
              },
              {
                k: "India-native",
                t: "Hinglish and locale packs, WhatsApp approval, INR-first pricing and Razorpay built in.",
              },
            ].map((f) => (
              <motion.div key={f.k} variants={fadeUp}>
                <div className="h-full rounded-2xl border border-line bg-card p-8">
                  <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-saffron-deep">
                    {f.k}
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-ink-soft">{f.t}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* pricing */}
        <section id="pricing" className="mx-auto max-w-6xl px-5 py-24 lg:px-8">
          <Reveal className="text-center">
            <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-saffron-deep">
              Pricing · INR-first
            </div>
            <h2 className="mt-3 font-display text-4xl font-medium tracking-[-0.02em]">
              Credits that map to approved work.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-ink-soft">
              Image and video credits are metered separately, so heavy users never quietly break
              your margin.
            </p>
          </Reveal>
          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
            className="mt-12 grid gap-4 md:grid-cols-3"
          >
            {PLANS.map((p) => (
              <motion.div key={p.name} variants={fadeUp}>
                <TiltCard max={6}>
                  <div
                    className={`flex h-full flex-col rounded-2xl border bg-card p-7 ${p.popular ? "border-saffron-deep shadow-xl shadow-saffron-deep/10" : "border-line"}`}
                  >
                    <div
                      className="flex items-center justify-between"
                      style={{ transform: "translateZ(25px)" }}
                    >
                      <h3 className="font-display text-2xl font-medium">{p.name}</h3>
                      {p.popular && (
                        <span className="rounded-full bg-saffron-deep px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-paper">
                          popular
                        </span>
                      )}
                    </div>
                    <div
                      className="mt-3 font-display text-4xl font-medium"
                      style={{ transform: "translateZ(25px)" }}
                    >
                      ₹{p.inr}
                      <span className="font-sans text-sm font-normal text-ink-soft">/mo</span>
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-ink-soft">
                      {p.credits} credits · {p.seats}
                    </div>
                    <ul className="mt-5 flex-1 space-y-2">
                      {p.feats.map((f) => (
                        <li key={f} className="flex items-center gap-2 text-sm text-ink-soft">
                          <span className="text-leaf">✓</span>
                          {f}
                        </li>
                      ))}
                    </ul>
                    <Magnetic
                      onClick={() => onEnter("billing")}
                      className={`mt-6 rounded-full py-3 text-sm font-medium ${p.popular ? "bg-saffron-deep text-paper" : "border border-ink text-ink hover:bg-ink hover:text-paper"}`}
                    >
                      Choose {p.name}
                    </Magnetic>
                  </div>
                </TiltCard>
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* final CTA */}
        <section className="mx-auto max-w-6xl px-5 pb-28 lg:px-8">
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl border border-line bg-card px-6 py-20 text-center lg:px-12">
              <div
                className="anim-drift pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full opacity-40 blur-3xl"
                style={{ background: "radial-gradient(circle, #e79a1f77, transparent 70%)" }}
              />
              <div
                className="anim-drift pointer-events-none absolute -left-16 bottom-0 h-72 w-72 rounded-full opacity-30 blur-3xl"
                style={{
                  background: "radial-gradient(circle, #d1560f55, transparent 70%)",
                  animationDelay: "3s",
                }}
              />
              <h2 className="relative mx-auto max-w-2xl font-display text-4xl font-medium tracking-[-0.02em] lg:text-5xl">
                Stop generating images. Start delivering approved packs.
              </h2>
              <p className="relative mx-auto mt-4 max-w-xl text-ink-soft">
                Your brand, your products, your channels — reliable creative from brief to publish.
              </p>
              <div className="relative mt-8 flex flex-wrap justify-center gap-3">
                <Magnetic
                  onClick={() => onEnter("productlock")}
                  className="rounded-full bg-saffron-deep px-7 py-3 font-medium text-paper shadow-lg shadow-saffron-deep/20"
                >
                  Start free →
                </Magnetic>
                <Magnetic
                  onClick={() => onEnter("overview")}
                  className="rounded-full border border-ink px-7 py-3 font-medium"
                >
                  Explore the studio
                </Magnetic>
              </div>
            </div>
          </Reveal>
        </section>

        {/* footer */}
        <footer className="border-t border-line bg-card">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 lg:px-8">
            <div className="flex items-baseline gap-2">
              <span className="font-display text-lg font-semibold">Creozentic</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft">
                by Autozentic · Jaipur
              </span>
            </div>
            <div className="font-mono text-[11px] text-ink-soft">
              © 2026 Autozentic · Creative reliability system
            </div>
          </div>
        </footer>
      </div>
    </MotionConfig>
  );
}
