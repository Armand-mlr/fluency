"use client";

import { useEffect, useState } from "react";
import type { SkillId, SkillState } from "@/lib/types";
import { LEVEL_BANDS, SKILLS } from "@/lib/engine/levels";
import { cx } from "@/lib/util";

/**
 * Level ruler: the 0–100 internal scale drawn like a typographer's ruler,
 * with the CEFR bands marked and a needle on your current rating.
 */
export function LevelRuler({ rating }: { rating: number }) {
  const [x, setX] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setX(rating));
    return () => cancelAnimationFrame(id);
  }, [rating]);
  const MIN = 30;
  const MAX = 95;
  const pos = (r: number) => ((Math.max(MIN, Math.min(MAX, r)) - MIN) / (MAX - MIN)) * 100;
  const ticks = Array.from({ length: (MAX - MIN) / 1 + 1 }, (_, i) => MIN + i);
  return (
    <div className="relative pt-7 pb-6 select-none">
      {/* filled track */}
      <div className="absolute left-0 right-0 top-7 h-[2px] bg-surface-3 rounded-full" />
      <div className="absolute left-0 top-7 h-[2px] bg-accent rounded-full transition-[width] duration-[1400ms] ease-[cubic-bezier(.2,.8,.2,1)]" style={{ width: `${pos(x)}%` }} />
      {/* ticks */}
      <div className="relative h-4">
        {ticks.map((t) => {
          const band = LEVEL_BANDS.some((b) => b.min === t);
          const five = t % 5 === 0;
          return (
            <span
              key={t}
              className={cx("absolute top-[2px] w-px", band ? "h-4 bg-line-strong" : five ? "h-2.5 bg-line-strong/70" : "h-1.5 bg-line")}
              style={{ left: `${pos(t)}%` }}
            />
          );
        })}
      </div>
      {/* band labels */}
      <div className="relative h-4 mt-1">
        {LEVEL_BANDS.filter((b) => b.min >= MIN).map((b) => (
          <span key={b.level} className={cx("absolute mono text-[10px] -translate-x-1/2", rating >= b.min ? "text-muted" : "text-faint")} style={{ left: `${pos(b.min)}%` }}>
            {b.level}
          </span>
        ))}
      </div>
      {/* needle */}
      <div className="absolute top-0 -translate-x-1/2 transition-[left] duration-[1400ms] ease-[cubic-bezier(.2,.8,.2,1)] flex flex-col items-center" style={{ left: `${pos(x)}%` }}>
        <span className="mono text-[10px] px-1.5 py-0.5 rounded bg-accent text-accent-ink font-semibold num">{Math.round(rating)}</span>
        <span className="w-px h-3 bg-accent" />
        <span className="size-2 rounded-full bg-accent pulse-dot -mt-0.5" />
      </div>
    </div>
  );
}

/** Radar chart of the active skills. Hovering a skill elsewhere highlights its axis. */
export function SkillRadar({ skills, active, onHover }: { skills: SkillState[]; active?: SkillId | null; onHover?: (s: SkillId | null) => void }) {
  const metas = SKILLS.filter((s) => !s.requiresAudio);
  const N = metas.length;
  const size = 360;
  const c = size / 2;
  const R = 140;
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / N;
  const scale = (r: number) => (Math.max(25, Math.min(100, r)) - 25) / 75; // 25..100 → 0..1
  const pt = (i: number, v: number) => [c + Math.cos(angle(i)) * R * v, c + Math.sin(angle(i)) * R * v] as const;
  const rating = (id: SkillId) => skills.find((s) => s.id === id)?.rating ?? 55;
  const poly = metas.map((m, i) => pt(i, scale(rating(m.id))).join(",")).join(" ");
  const rings = [
    { r: 47, l: "B2" },
    { r: 63, l: "C1" },
    { r: 82, l: "C2" },
  ];

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-auto overflow-visible" role="img" aria-label="Skill radar">
      {/* rings */}
      {rings.map((ring) => (
        <g key={ring.l}>
          <polygon
            points={metas.map((_, i) => pt(i, scale(ring.r)).join(",")).join(" ")}
            fill="none"
            stroke="var(--line)"
            strokeDasharray={ring.l === "C2" ? "0" : "3 4"}
          />
          <text x={c + 4} y={c - R * scale(ring.r) - 4} className="mono" fontSize="9" fill="var(--faint)">
            {ring.l}
          </text>
        </g>
      ))}
      {/* axes */}
      {metas.map((m, i) => {
        const [x, y] = pt(i, 1);
        const [lx, ly] = pt(i, 1.17);
        const on = active === m.id;
        return (
          <g key={m.id} onMouseEnter={() => onHover?.(m.id)} onMouseLeave={() => onHover?.(null)} className="cursor-default">
            <line x1={c} y1={c} x2={x} y2={y} stroke={on ? "var(--accent)" : "var(--line)"} strokeWidth={on ? 1.5 : 1} />
            <text
              x={lx}
              y={ly}
              textAnchor={Math.abs(lx - c) < 8 ? "middle" : lx > c ? "start" : "end"}
              dominantBaseline="middle"
              fontSize="11"
              fill={on ? "var(--ink)" : "var(--muted)"}
              fontWeight={on ? 600 : 400}
            >
              {m.short}
            </text>
          </g>
        );
      })}
      {/* shape */}
      <g className="grow" style={{ transformOrigin: `${c}px ${c}px` }}>
        <polygon points={poly} fill="var(--accent)" fillOpacity="0.13" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" />
        {metas.map((m, i) => {
          const [x, y] = pt(i, scale(rating(m.id)));
          const on = active === m.id;
          return <circle key={m.id} cx={x} cy={y} r={on ? 5 : 3} fill={on ? "var(--accent)" : "var(--bg)"} stroke="var(--accent)" strokeWidth="1.5" className="transition-all" />;
        })}
      </g>
    </svg>
  );
}

/** Activity heatmap: last N weeks, one square per day. */
export function Heatmap({ activity, now, weeks = 14 }: { activity: Map<string, number>; now: number; weeks?: number }) {
  const DAY = 86_400_000;
  const d0 = new Date(now);
  d0.setHours(0, 0, 0, 0);
  const today = d0.getTime();
  const dow = (d0.getDay() + 6) % 7;
  const start = today - (weeks - 1) * 7 * DAY - dow * DAY;
  const key = (t: number) => {
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const level = (n: number) =>
    n === 0 ? "bg-surface-3/70" : n < 8 ? "bg-accent/25" : n < 20 ? "bg-accent/55" : n < 40 ? "bg-accent/80" : "bg-accent";
  return (
    <div className="flex gap-[3px]">
      {Array.from({ length: weeks }, (_, w) => (
        <div key={w} className="flex flex-col gap-[3px] flex-1">
          {Array.from({ length: 7 }, (_, d) => {
            const t = start + (w * 7 + d) * DAY;
            const n = activity.get(key(t)) ?? 0;
            return (
              <div
                key={d}
                className={cx("aspect-square rounded-[3px] transition-transform hover:scale-125", t > today ? "opacity-0" : level(n), t === today && "ring-1 ring-accent ring-offset-1 ring-offset-surface")}
                title={`${key(t)} · ${n} answers`}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Slowly scrolling band of the words you're learning. */
export function WordTicker({ words }: { words: string[] }) {
  if (!words.length) return null;
  const list = [...words, ...words];
  return (
    <div className="marquee-wrap relative overflow-hidden border-y border-line py-5 [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
      <div className="marquee flex w-max gap-8 whitespace-nowrap">
        {list.map((w, i) => (
          <span key={i} className="flex items-center gap-8">
            <span className="font-display italic-display text-[30px] text-ink/85 hover:text-accent transition-colors">{w}</span>
            <span className="text-accent text-[18px]">✳</span>
          </span>
        ))}
      </div>
    </div>
  );
}
