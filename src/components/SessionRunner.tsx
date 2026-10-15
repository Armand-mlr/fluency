"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Attempt } from "@/lib/types";
import type { Planned } from "@/lib/engine/session";
import { recordAttempt, startSession, updateSession } from "@/lib/db/repo";
import { useFocusMode, useSettings } from "@/lib/hooks";
import { ExercisePlayer, type Outcome } from "./ExercisePlayer";
import { Bar, Button, Chip, LinkButton } from "./ui";
import { Icon } from "./Icon";
import { skillLabel } from "@/lib/engine/levels";
import { cx, formatMinutes } from "@/lib/util";

const BLOCK_LABEL = { review: "Review", practice: "Practice", production: "Production" } as const;

export function SessionRunner({
  plan,
  mode,
  sessionMode = "daily",
  onFinish,
  exitHref = "/",
  finishHref = "/",
  finishLabel = "Back to today",
}: {
  plan: Planned[];
  mode: Attempt["mode"];
  sessionMode?: "daily" | "challenge" | "review";
  onFinish?: (outcomes: Outcome[]) => void | Promise<void>;
  exitHref?: string;
  finishHref?: string;
  finishLabel?: string;
}) {
  const settings = useSettings();
  const [i, setI] = useState(0);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const sessionId = useRef<string | null>(null);
  const started = useRef(0);
  const [totalMs, setTotalMs] = useState(0);
  useFocusMode(true);

  useEffect(() => {
    if (!started.current) started.current = Date.now();
    if (!sessionId.current && plan.length) {
      sessionId.current = "pending";
      startSession(sessionMode, plan.length).then((id) => (sessionId.current = id));
    }
  }, [plan.length, sessionMode]);

  async function handleDone(o: Outcome) {
    const p = plan[i];
    await recordAttempt({ ex: p.ex, result: o.result, answer: o.answer, durationMs: o.durationMs, mode, sessionId: sessionId.current ?? undefined });
    const next = [...outcomes, o];
    setOutcomes(next);
    if (sessionId.current && sessionId.current !== "pending") {
      await updateSession(sessionId.current, {
        done: next.length,
        correct: next.filter((x) => x.result.score >= 0.85).length,
        durationMs: Date.now() - started.current,
        endedAt: i + 1 >= plan.length ? Date.now() : undefined,
      });
    }
    if (i + 1 >= plan.length) {
      setTotalMs(Date.now() - started.current);
      await onFinish?.(next);
    }
    setI(i + 1);
    window.scrollTo({ top: 0 });
  }

  if (!plan.length) return null;

  if (i >= plan.length) return <Summary plan={plan} outcomes={outcomes} ms={totalMs} finishHref={finishHref} finishLabel={finishLabel} />;

  const cur = plan[i];
  return (
    <div className="min-h-screen">
      <FocusBar current={i} outcomes={outcomes} total={plan.length} label={BLOCK_LABEL[cur.block]} exitHref={exitHref} />
      <div className="mx-auto max-w-2xl px-5 sm:px-6 pt-10 pb-24 md:pt-16">
        <ExercisePlayer key={`${cur.ex.id}-${i}`} ex={cur.ex} reason={cur.reason} settings={settings} onDone={handleDone} compact={mode === "diagnostic"} />
      </div>
    </div>
  );
}

/** Top bar of focus mode: one segment per exercise, coloured by result. */
export function FocusBar({ current, outcomes, total, label, exitHref = "/" }: { current: number; outcomes: Outcome[]; total: number; label?: string; exitHref?: string }) {
  return (
    <div className="sticky top-0 z-30 bg-bg/80 backdrop-blur-md border-b border-line">
      <div className="mx-auto max-w-3xl px-5 sm:px-6 h-16 flex items-center gap-5">
        <Link href={exitHref} className="size-9 grid place-items-center rounded-full text-muted hover:text-ink hover:bg-surface-2 transition-colors" aria-label="Leave">
          <Icon name="x" className="size-4" />
        </Link>
        <div className="flex-1 flex gap-[3px] items-center">
          {Array.from({ length: total }, (_, k) => {
            const o = outcomes[k];
            const c = o ? (o.result.score >= 0.85 ? "bg-good" : o.result.score >= 0.5 ? "bg-warn" : "bg-bad") : k === current ? "bg-accent" : "bg-surface-3";
            return <span key={k} className={cx("h-[5px] flex-1 rounded-full transition-all duration-500", c, k === current && "h-[7px] pulse-dot")} />;
          })}
        </div>
        <span className="mono text-[11px] text-muted num whitespace-nowrap">
          {label && <span className="hidden sm:inline text-accent uppercase tracking-[0.14em] mr-3">{label}</span>}
          {String(Math.min(current + 1, total)).padStart(2, "0")}
          <span className="text-faint">/{String(total).padStart(2, "0")}</span>
        </span>
      </div>
    </div>
  );
}

function Summary({ plan, outcomes, ms, finishHref, finishLabel }: { plan: Planned[]; outcomes: Outcome[]; ms: number; finishHref: string; finishLabel: string }) {
  const correct = outcomes.filter((o) => o.result.score >= 0.85).length;
  const ratio = outcomes.length ? correct / outcomes.length : 0;
  const missed = plan.map((p, idx) => ({ p, o: outcomes[idx] })).filter((x) => x.o && x.o.result.score < 0.5);
  const skills = new Map<string, { n: number; s: number }>();
  plan.forEach((p, idx) => {
    const o = outcomes[idx];
    if (!o) return;
    const k = p.ex.skills[0];
    const v = skills.get(k) ?? { n: 0, s: 0 };
    skills.set(k, { n: v.n + 1, s: v.s + o.result.score });
  });
  const verdict = ratio >= 0.85 ? "Sharp work." : ratio >= 0.65 ? "Solid session." : ratio >= 0.4 ? "Good friction." : "That was hard. Good.";
  const R = 64;
  const C = 2 * Math.PI * R;
  return (
    <div className="mx-auto max-w-3xl px-5 sm:px-6 py-14 md:py-20">
      <div className="stagger">
        <div className="flex items-center gap-3">
          <span className="kicker">Session complete</span>
          <span className="hairline flex-1" />
          <span className="kicker">{formatMinutes(ms)}</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-8 mt-8">
          <svg viewBox="0 0 160 160" className="size-40 shrink-0 -rotate-90">
            <circle cx="80" cy="80" r={R} fill="none" stroke="var(--surface-3)" strokeWidth="8" />
            <circle
              cx="80"
              cy="80"
              r={R}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={C}
              style={{ ["--len" as string]: C, ["--to" as string]: C * (1 - ratio), strokeDashoffset: C * (1 - ratio), animation: "draw 1.4s cubic-bezier(.2,.8,.2,1) both" } as React.CSSProperties}
            />
            <text x="80" y="80" transform="rotate(90 80 80)" textAnchor="middle" dominantBaseline="central" className="font-display" fontSize="40" fill="var(--ink)">
              {Math.round(ratio * 100)}%
            </text>
          </svg>
          <div>
            <h1 className="font-display text-[52px] sm:text-[64px] leading-[0.95]">
              <em>{verdict}</em>
            </h1>
            <p className="text-muted mt-4 text-[16px] max-w-md leading-relaxed">
              {correct} of {outcomes.length} answers were solid. Everything you missed is already scheduled to come back, in a different form.
            </p>
          </div>
        </div>

        <div className="card p-7 mt-12">
          <p className="kicker mb-5">By skill</p>
          <div className="space-y-3.5">
            {[...skills.entries()].map(([k, v]) => (
              <div key={k} className="flex items-center gap-4 text-[14px]">
                <span className="w-36 sm:w-48 shrink-0">{skillLabel(k as never)}</span>
                <Bar value={v.s / v.n} className="flex-1" tone={v.s / v.n >= 0.75 ? "good" : v.s / v.n >= 0.5 ? "warn" : "bad"} />
                <span className="w-10 text-right mono text-[12px] text-muted num">{Math.round((v.s / v.n) * 100)}</span>
              </div>
            ))}
          </div>
        </div>

        {missed.length > 0 && (
          <div className="card p-7 mt-4">
            <p className="kicker mb-5">Coming back soon</p>
            <ul className="divide-y divide-line">
              {missed.map(({ p }, k) => (
                <li key={k} className="py-3 flex gap-3 items-baseline">
                  <Chip tone="bad">{skillLabel(p.ex.skills[0])}</Chip>
                  <span className="text-muted text-[14px]">
                    {"prompt" in p.ex && p.ex.prompt ? p.ex.prompt.replace(/\*\*/g, "").split("\n").find((l) => l.trim())?.slice(0, 100) : p.ex.instruction}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-3 mt-10">
          <LinkButton href={finishHref} variant="primary" size="lg">
            {finishLabel}
          </LinkButton>
          <Button size="lg" onClick={() => location.reload()}>
            Another round
          </Button>
        </div>
      </div>
    </div>
  );
}
