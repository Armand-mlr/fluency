"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { Fragment, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cx } from "@/lib/util";
import type { Register } from "@/lib/types";

/* ---------- buttons ---------- */

type Variant = "primary" | "secondary" | "ghost" | "danger";

const BTN: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-ink hover:shadow-[0_0_0_4px_var(--accent-soft),0_10px_30px_-10px_var(--accent)] active:translate-y-px",
  secondary: "bg-surface-2 border border-line text-ink hover:border-line-strong hover:bg-surface-3 active:translate-y-px",
  ghost: "text-muted hover:text-ink hover:bg-surface-2",
  danger: "bg-bad-soft text-bad border border-bad/20 hover:bg-bad/15",
};
const SIZE = { sm: "text-[13px] h-8 px-3", md: "text-[14px] h-10 px-4", lg: "text-[15px] h-12 px-6" };

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: keyof typeof SIZE }) {
  return (
    <button
      {...p}
      className={cx(
        "group/btn relative inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-[-0.01em] transition-all duration-200 disabled:opacity-35 disabled:pointer-events-none cursor-pointer select-none",
        SIZE[size],
        BTN[variant],
        className,
      )}
    />
  );
}

export function LinkButton({
  href,
  children,
  variant = "secondary",
  size = "md",
  className,
}: {
  href: string;
  children: ReactNode;
  variant?: Variant;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cx("group/btn inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-[-0.01em] transition-all duration-200", SIZE[size], BTN[variant], className)}
    >
      {children}
    </Link>
  );
}

/* ---------- layout ---------- */

export function Page({ children, narrow }: { children: ReactNode; narrow?: boolean }) {
  return <div className={cx("relative mx-auto px-5 sm:px-10 py-8 md:py-14", narrow ? "max-w-3xl" : "max-w-6xl")}>{children}</div>;
}

/** Newspaper-style header: mono kicker line, big serif title, optional actions. */
export function PageHeader({ title, kicker, children, lede }: { title: ReactNode; kicker?: string; children?: ReactNode; lede?: ReactNode }) {
  return (
    <header className="mb-10 stagger">
      {kicker && (
        <div className="flex items-center gap-3 mb-4">
          <span className="kicker">{kicker}</span>
          <span className="hairline flex-1" />
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-5">
        <h1 className="font-display text-[44px] sm:text-[56px] leading-[0.95]">{title}</h1>
        {children && <div className="flex gap-2 flex-wrap">{children}</div>}
      </div>
      {lede && <p className="text-muted text-[16px] leading-relaxed max-w-2xl mt-4">{lede}</p>}
    </header>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("card", className)}>{children}</div>;
}

/* ---------- small pieces ---------- */

type Tone = "neutral" | "accent" | "good" | "bad" | "warn";
const TONE: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted border-line",
  accent: "bg-accent-soft text-accent border-accent/25",
  good: "bg-good-soft text-good border-good/25",
  bad: "bg-bad-soft text-bad border-bad/25",
  warn: "bg-warn-soft text-warn border-warn/25",
};

export function Chip({ children, tone = "neutral", className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full border px-2.5 py-[3px] text-[11.5px] font-medium whitespace-nowrap", TONE[tone], className)}>
      {children}
    </span>
  );
}

const REG_TONE: Record<Register, Tone> = {
  casual: "warn",
  neutral: "neutral",
  professional: "good",
  formal: "accent",
  academic: "accent",
  literary: "accent",
};
export function RegisterChip({ r }: { r: Register }) {
  return <Chip tone={REG_TONE[r]}>{r}</Chip>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function Bar({ value, className, tone = "accent" }: { value: number; className?: string; tone?: "accent" | "good" | "bad" | "warn" }) {
  const c = { accent: "bg-accent", good: "bg-good", bad: "bg-bad", warn: "bg-warn" }[tone];
  const [w, setW] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setW(Math.max(0, Math.min(100, value * 100))));
    return () => cancelAnimationFrame(id);
  }, [value]);
  return (
    <div className={cx("h-[5px] rounded-full bg-surface-3 overflow-hidden", className)}>
      <div className={cx("h-full rounded-full transition-[width] duration-[1100ms] ease-[cubic-bezier(.2,.8,.2,1)]", c)} style={{ width: `${w}%` }} />
    </div>
  );
}

/** Animated number (counts up when it appears or changes). */
export function CountUp({ value, decimals = 0, suffix = "" }: { value: number; decimals?: number; suffix?: string }) {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let id = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 900);
      const e = 1 - Math.pow(1 - k, 3);
      setV(a + (value - a) * e);
      if (k < 1) id = requestAnimationFrame(tick);
      else from.current = value;
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [value]);
  return (
    <span className="num">
      {v.toFixed(decimals)}
      {suffix}
    </span>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <div className="kicker !text-[10px]">{label}</div>
      <div className="font-display text-[40px] leading-none mt-3 num">{value}</div>
      {sub && <div className="text-[12.5px] text-faint mt-2">{sub}</div>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-[18px] border border-dashed border-line-strong p-12 text-center">
      <p className="font-display text-[26px] italic-display">{title}</p>
      {children && <div className="text-muted text-[14px] mt-3 max-w-md mx-auto leading-relaxed">{children}</div>}
    </div>
  );
}

/** Minimal rich text: **bold** becomes a highlighter mark; line breaks preserved. */
export function Rich({ text, className }: { text: string; className?: string }) {
  const lines = text.split("\n");
  return (
    <div className={className}>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
            part.startsWith("**") && part.endsWith("**") ? (
              <mark key={j} className="marker text-ink">
                {part.slice(2, -2)}
              </mark>
            ) : (
              <Fragment key={j}>{part}</Fragment>
            ),
          )}
          {i < lines.length - 1 && <br />}
        </Fragment>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => [...(dialog.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]') ?? [])].filter(el => el.getClientRects().length);
    if (!dialog.current?.contains(document.activeElement)) (focusable()[0] ?? dialog.current)?.focus();
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close.current(); }
      if (e.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0], last = elements[elements.length - 1];
      if (!first) { e.preventDefault(); dialog.current?.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", k);
    return () => {
      window.removeEventListener("keydown", k);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open]);
  if (!open || typeof document === "undefined") return null;
  // A portal keeps fixed positioning independent of the animated page wrapper.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm p-0 sm:p-6 animate-[rise_.25s_ease-out]" onMouseDown={onClose}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className="card w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rise rounded-b-none sm:rounded-[22px] !bg-surface" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-7 pt-6">
          <h2 className="font-display text-[30px] leading-none">{title}</h2>
          <button onClick={onClose} className="size-8 grid place-items-center rounded-full text-muted hover:text-ink hover:bg-surface-2" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="px-7 pb-7 pt-5">{children}</div>
      </div>
    </div>, document.body
  );
}

export function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <label className="block text-[12.5px] font-semibold mb-2 tracking-[-0.01em]">
      {children}
      {hint && <span className="text-faint font-normal ml-1.5">{hint}</span>}
    </label>
  );
}

/** Segmented toggle (e.g. session length). */
export function Segmented<T extends string | number>({ value, options, onChange, format }: { value: T; options: T[]; onChange: (v: T) => void; format?: (v: T) => string }) {
  return (
    <div className="inline-flex p-1 rounded-full bg-bg-2 border border-line">
      {options.map((o) => (
        <button
          key={String(o)}
          onClick={() => onChange(o)}
          className={cx("h-8 px-4 rounded-full text-[13px] font-semibold transition-all", value === o ? "bg-accent text-accent-ink shadow" : "text-muted hover:text-ink")}
        >
          {format ? format(o) : String(o)}
        </button>
      ))}
    </div>
  );
}
