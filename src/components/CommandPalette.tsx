"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/schema";
import { Icon, type IconName } from "./Icon";
import { Kbd } from "./ui";
import { cx } from "@/lib/util";
import { NAV } from "./nav";

interface Cmd {
  id: string;
  label: string;
  hint?: string;
  icon: IconName;
  href: string;
  group: string;
}

const ACTIONS: Cmd[] = [
  { id: "a-session", label: "Start today's session", hint: "Adaptive, ~15 min", icon: "arrow", href: "/session", group: "Actions" },
  { id: "a-mistakes", label: "Drill my mistakes", icon: "target", href: "/session?mode=mistakes", group: "Actions" },
  { id: "a-review", label: "Review only", hint: "Due cards, nothing new", icon: "clock", href: "/session?mode=review", group: "Actions" },
  { id: "a-add", label: "Add a word or expression", icon: "plus", href: "/vocabulary?add=1", group: "Actions" },
];

/** ⌘K: jump anywhere, start anything, find any word you've saved. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const items = useLiveQuery(() => (open ? db.items.toArray() : []), [open]);

  const results = useMemo(() => {
    const nav: Cmd[] = NAV.map((n) => ({ id: n.href, label: n.label, hint: n.hint, icon: n.icon, href: n.href, group: "Go to" }));
    const needle = q.trim().toLowerCase();
    const base = [...ACTIONS, ...nav].filter((c) => !needle || `${c.label} ${c.hint ?? ""}`.toLowerCase().includes(needle));
    const words: Cmd[] = needle
      ? (items ?? [])
          .filter((i) => `${i.text} ${i.meaning} ${i.translationFr ?? ""}`.toLowerCase().includes(needle))
          .slice(0, 6)
          .map((i) => ({ id: i.id, label: i.text, hint: i.meaning, icon: "book" as const, href: `/vocabulary?q=${encodeURIComponent(i.text)}`, group: "Your words" }))
      : [];
    return [...base, ...words];
  }, [q, items]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        setQ("");
        setSel(0);
        input.current?.focus();
      });
    }
  }, [open]);

  if (!open) return null;

  const go = (c?: Cmd) => {
    if (!c) return;
    onClose();
    router.push(c.href);
  };

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 backdrop-blur-sm px-4 pt-[14vh]" onMouseDown={onClose}>
      <div className="card w-full max-w-xl overflow-hidden rise !bg-surface" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 h-14 border-b border-line">
          <Icon name="search" className="size-4 text-faint" />
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(results.length - 1, s + 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              }
              if (e.key === "Enter") go(results[sel]);
            }}
            placeholder="Search pages, actions, your words…"
            className="flex-1 bg-transparent outline-none focus-visible:outline-none text-[15px] placeholder:text-faint"
          />
          <Kbd>esc</Kbd>
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-2">
          {results.length === 0 && <p className="text-center text-muted text-[14px] py-8">Nothing matches “{q}”.</p>}
          {results.map((c, i) => {
            const header = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            return (
              <div key={c.id + c.group}>
                {header && <p className="kicker !text-[9.5px] px-3 pt-3 pb-1.5">{header}</p>}
                <button
                  onMouseEnter={() => setSel(i)}
                  onClick={() => go(c)}
                  className={cx("w-full flex items-center gap-3 rounded-xl px-3 h-11 text-left transition-colors", sel === i ? "bg-surface-2 text-ink" : "text-muted")}
                >
                  <span className={cx("grid place-items-center size-7 rounded-lg", sel === i ? "bg-accent text-accent-ink" : "bg-surface-2")}>
                    <Icon name={c.icon} className="size-3.5" />
                  </span>
                  <span className="text-[14px] font-medium text-ink">{c.label}</span>
                  {c.hint && <span className="text-[12.5px] text-faint truncate">{c.hint}</span>}
                  {sel === i && <span className="ml-auto kbd">↵</span>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
