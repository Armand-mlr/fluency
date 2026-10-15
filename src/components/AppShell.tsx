"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ensureSeeded, updateSettings } from "@/lib/db/repo";
import { useStreak, useSettings } from "@/lib/hooks";
import { cx } from "@/lib/util";
import { Icon } from "./Icon";
import { NAV } from "./nav";
import { CommandPalette } from "./CommandPalette";
import { Kbd } from "./ui";



export function AppShell({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [palette, setPalette] = useState(false);
  const path = usePathname();

  useEffect(() => {
    ensureSeeded()
      .then(async () => {
        try { const c = await fetch("/api/ai").then(r => r.json()); await updateSettings({ aiProvider: c.error ? "none" : c.mode, aiModel: c.error ? "" : c.model }); } catch { await updateSettings({ aiProvider: "none", aiModel: "" }); }
        setReady(true);
      })
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);

  // ⌘K / Ctrl+K opens the command palette anywhere
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const [focusFlag, setFocusFlag] = useState(false);
  useEffect(() => {
    const f = (e: Event) => setFocusFlag(Boolean((e as CustomEvent).detail));
    window.addEventListener("fluency:focus", f);
    return () => window.removeEventListener("fluency:focus", f);
  }, []);
  const focusMode = path.startsWith("/session") || focusFlag;

  return (
    <div className="relative z-10 min-h-screen md:flex">
      {!focusMode && <Sidebar path={path} onPalette={() => setPalette(true)} />}
      {!focusMode && <MobileTop onPalette={() => setPalette(true)} />}
      <main className={cx("flex-1 min-w-0", !focusMode && "pb-28 md:pb-0")}>
        {error ? (
          <div className="p-10 max-w-lg">
            <p className="font-display text-[28px]">The local database could not be opened.</p>
            <p className="text-muted text-sm mt-3">{error}</p>
            <p className="text-muted text-sm mt-2">Private browsing or blocked site data can prevent storage.</p>
          </div>
        ) : ready ? (
          <div key={path} className="route-enter">{children}</div>
        ) : (
          <Loading />
        )}
      </main>
      {!focusMode && <MobileNav path={path} />}
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  );
}

function Loading() {
  return (
    <div className="h-[70vh] grid place-items-center">
      <div className="text-center">
        <p className="font-display italic-display text-[32px] text-muted">Setting the type…</p>
        <div className="mt-4 mx-auto h-[3px] w-40 rounded-full bg-surface-3 overflow-hidden">
          <div className="h-full w-1/3 bg-accent rounded-full animate-[marquee_1.2s_ease-in-out_infinite_alternate]" />
        </div>
      </div>
    </div>
  );
}

export function Wordmark({ size = 34 }: { size?: number }) {
  return (
    <span className="font-display inline-flex items-baseline leading-none" style={{ fontSize: size }}>
      <span className="italic-display">Fluency</span>
      <span className="text-accent ml-[1px]">.</span>
    </span>
  );
}

function Sidebar({ path, onPalette }: { path: string; onPalette: () => void }) {
  const streak = useStreak();
  const settings = useSettings();
  return (
    <aside className="hidden md:flex w-[248px] shrink-0 flex-col border-r border-line px-5 py-7 sticky top-0 h-screen bg-bg-2/60 backdrop-blur-sm">
      <Link href="/" className="px-2 block">
        <Wordmark />
        <p className="kicker mt-2 !text-[9.5px]">Your edition · {settings.currentLevel ?? "B2"} → {settings.targetLevel ?? "C2"}</p>
      </Link>

      <button
        onClick={onPalette}
        className="mt-7 mx-1 flex items-center gap-2 rounded-full border border-line bg-surface/60 px-3.5 h-9 text-[13px] text-faint hover:text-muted hover:border-line-strong transition-colors"
      >
        <Icon name="search" className="size-3.5" />
        <span className="flex-1 text-left">Jump to…</span>
        <Kbd>⌘K</Kbd>
      </button>

      <nav className="flex flex-col mt-6">
        {NAV.map((n, i) => {
          const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "group relative flex items-center gap-3 rounded-xl px-3 h-10 text-[14px] transition-colors",
                active ? "text-ink" : "text-muted hover:text-ink",
              )}
            >
              <span className={cx("absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-full bg-accent transition-all duration-300", active ? "opacity-100" : "opacity-0 -translate-x-1")} />
              <span className={cx("mono text-[10px] w-5 transition-colors", active ? "text-accent" : "text-faint group-hover:text-muted")}>{String(i + 1).padStart(2, "0")}</span>
              <span className={cx("transition-transform duration-300", !active && "group-hover:translate-x-0.5")}>{n.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-3">
        <Link href="/settings#ai" className="sidebar-ai"><span className="status-dot" />{settings.aiProvider === "none" ? "IA non configurée" : settings.aiProvider === "ollama" ? "Ollama · local" : "API · distante"}<small>{settings.aiModel || "Configurer un modèle →"}</small></Link>
        <div className="card !rounded-2xl p-4 flex items-center gap-3">
          <span className={cx("grid place-items-center size-9 rounded-full", streak > 0 ? "bg-ember/15 text-ember" : "bg-surface-2 text-faint")}>
            <Icon name="flame" className={cx("size-[18px]", streak > 0 && "flicker")} />
          </span>
          <div className="leading-tight">
            <p className="font-display text-[22px] num">{streak}</p>
            <p className="text-[11.5px] text-faint">{streak === 1 ? "day streak" : "days streak"}</p>
          </div>
        </div>
        <ThemeToggle />
      </div>
    </aside>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"night" | "day">("night");
  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    // sync with the value set by the pre-paint script
    if (t === "day") requestAnimationFrame(() => setTheme("day"));
    const sync = (e: Event) => setTheme((e as CustomEvent).detail);
    window.addEventListener("fluency:theme", sync);
    return () => window.removeEventListener("fluency:theme", sync);
  }, []);
  const set = (t: "night" | "day") => {
    setTheme(t);
    document.documentElement.setAttribute("data-theme", t);
    window.dispatchEvent(new CustomEvent("fluency:theme", { detail: t }));
    try {
      localStorage.setItem("fluency-theme", t);
    } catch {}
  };
  return (
    <div className="flex p-1 rounded-full border border-line bg-bg">
      {(["night", "day"] as const).map((t) => (
        <button
          key={t}
          onClick={() => set(t)}
          className={cx("flex-1 h-7 rounded-full text-[11.5px] mono uppercase tracking-wider transition-all", theme === t ? "bg-surface-3 text-ink" : "text-faint hover:text-muted")}
        >
          {t === "night" ? "Night" : "Day"}
        </button>
      ))}
    </div>
  );
}

function MobileTop({ onPalette }: { onPalette: () => void }) {
  return (
    <div className="md:hidden sticky top-0 z-30 flex items-center justify-between px-5 h-14 border-b border-line bg-bg/85 backdrop-blur">
      <Link href="/">
        <Wordmark size={26} />
      </Link>
      <button onClick={onPalette} className="size-9 grid place-items-center rounded-full border border-line text-muted" aria-label="Search">
        <Icon name="search" className="size-4" />
      </button>
    </div>
  );
}

function MobileNav({ path }: { path: string }) {
  return (
    <nav className="md:hidden fixed bottom-3 inset-x-3 z-30 rounded-full border border-line bg-surface/90 backdrop-blur-xl flex justify-around py-2 shadow-2xl">
      {NAV.filter((n) => n.mobile).map((n) => {
        const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
        return (
          <Link key={n.href} href={n.href} className={cx("flex flex-col items-center gap-0.5 px-2 text-[10.5px] transition-colors", active ? "text-accent" : "text-muted")}>
            <Icon name={n.icon} className="size-5" />
            {n.short ?? n.label}
          </Link>
        );
      })}
    </nav>
  );
}
