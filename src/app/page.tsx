"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/schema";
import { useSettings } from "@/lib/hooks";
import { computeStreak } from "@/lib/hooks";
import { ACTIVE_SKILLS, LEVEL_BANDS, SKILLS, ratingToLevel, skillLabel } from "@/lib/engine/levels";
import { recentWeakSpots } from "@/lib/engine/session";
import { Bar, Chip, CountUp, LinkButton, Page, Stat } from "@/components/ui";
import { Heatmap, LevelRuler, SkillRadar, WordTicker } from "@/components/viz";
import type { SkillId } from "@/lib/types";
import { Icon } from "@/components/Icon";
import { LearningLibraryCard } from "@/components/LearningLibraryCard";
import { DAY, cx, dayKey, formatMinutes, startOfDay } from "@/lib/util";

function useDashboard() {
  return useLiveQuery(async () => {
    const now = Date.now();
    const [skills, cards, items, mistakes, attempts, assessments] = await Promise.all([
      db.skills.toArray(),
      db.cards.toArray(),
      db.items.toArray(),
      db.mistakes.toArray(),
      db.attempts.where("createdAt").above(now - 400 * DAY).toArray(),
      db.assessments.count(),
    ]);
    const endToday = startOfDay(now) + DAY;
    const itemById = new Map(items.map((i) => [i.id, i]));
    const produce = cards.filter((c) => c.refType === "item" && c.facet === "produce");
    const masteredItems = produce.filter((c) => c.state === "mastered").map((c) => itemById.get(c.refId)).filter(Boolean);
    const week = attempts.filter((a) => a.createdAt > now - 7 * DAY);
    const due = cards.filter((c) => !c.suspended && c.state !== "new" && c.due <= endToday);
    const recent = cards
      .filter((c) => c.refType === "item" && c.facet === "recognize" && c.firstSeen && c.firstSeen > now - 7 * DAY)
      .sort((a, b) => (b.firstSeen ?? 0) - (a.firstSeen ?? 0))
      .map((c) => itemById.get(c.refId)!)
      .filter(Boolean)
      .slice(0, 8);
    const weak = recentWeakSpots({ now, attempts }, 10);
    const GENERIC = new Set(["word", "expression", "sentence", "structure", "my-mistake", "unknown", "collocation", "idiom"]);
    const weakTags = [...weak.tags.entries()].filter(([t, v]) => v >= 1 && !GENERIC.has(t)).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const activity = new Map<string, number>();
    for (const a of attempts) activity.set(dayKey(a.createdAt), (activity.get(dayKey(a.createdAt)) ?? 0) + 1);

    return {
      now,
      skills,
      due: due.length,
      dueMistakes: due.filter((c) => c.refType === "mistake").length,
      newAvailable: cards.filter((c) => c.state === "new" && c.facet === "recognize").length,
      wordsMastered: masteredItems.filter((i) => i!.kind === "word").length,
      exprMastered: masteredItems.filter((i) => i!.kind !== "word").length,
      itemsTotal: items.length,
      recurring: mistakes.filter((m) => m.count >= 2 && !m.resolved).length,
      mistakesTotal: mistakes.length,
      streak: computeStreak(attempts, now),
      timeWeek: week.reduce((s, a) => s + a.durationMs, 0),
      timeTotal: attempts.reduce((s, a) => s + a.durationMs, 0),
      successWeek: week.length ? week.filter((a) => a.score >= 0.85).length / week.length : null,
      answersWeek: week.length,
      answersToday: attempts.filter((a) => a.createdAt >= startOfDay(now)).length,
      recent,
      weakTags,
      activity,
      assessed: assessments > 0,
      totalAnswers: attempts.length,
      firstDay: attempts.length ? Math.min(...attempts.map((a) => a.createdAt)) : now,
      words: items.map((i) => i.text),
      lowSkill: [...skills].filter((s) => ACTIVE_SKILLS.includes(s.id)).sort((a, b) => a.rating - b.rating)[0]?.id,
    };
  }, []);
}

export default function Dashboard() {
  const d = useDashboard();
  const settings = useSettings();
  const router = useRouter();
  const [hover, setHover] = useState<SkillId | null>(null);

  // "S" starts the session from the dashboard (keyboard-first)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.metaKey || e.ctrlKey) return;
      if (e.key.toLowerCase() === "s") router.push(d?.assessed ? "/session" : "/assessment");
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [router, d?.assessed]);

  if (!d) return null;

  const active = d.skills.filter((s) => ACTIVE_SKILLS.includes(s.id));
  const overall = active.length ? active.reduce((s, x) => s + x.rating, 0) / active.length : 55;
  const level = ratingToLevel(overall);
  const nextBand = LEVEL_BANDS.find((b) => b.min > overall);
  const weekAgo = d.now - 7 * DAY;
  const trend = (h: { t: number; r: number }[], r: number) => {
    const past = [...h].reverse().find((p) => p.t <= weekAgo) ?? h[0];
    return past ? r - past.r : 0;
  };
  const sorted = [...active].sort((a, b) => a.rating - b.rating);
  const hour = new Date(d.now).getHours();
  const [greet, when] = hour < 5 ? ["Burning the", "midnight oil"] : hour < 12 ? ["Good", "morning"] : hour < 18 ? ["Good", "afternoon"] : ["Good", "evening"];
  const issue = Math.max(1, Math.floor((startOfDay(d.now) - startOfDay(d.firstDay)) / DAY) + 1);
  const date = new Date(d.now).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const minutes = settings.sessionMinutes;
  const name = settings.name?.trim();

  return (
    <div className="relative">
      <Page>
        {/* ---------- masthead ---------- */}
        <div className="stagger">
          <div className="flex items-center gap-3">
            <span className="kicker">No. {String(issue).padStart(3, "0")}</span>
            <span className="hairline flex-1" />
            <span className="kicker hidden sm:inline">{date}</span>
          </div>
          <h1 className="font-display text-[52px] sm:text-[84px] leading-[0.92] mt-6 max-w-4xl">
            {greet} <em className="text-accent">{when}</em>
            {name ? `, ${name}` : ""}.
          </h1>
          <p className="text-[17px] sm:text-[19px] text-muted mt-5 max-w-2xl leading-relaxed">
            {!d.assessed ? (
              <>Before anything, let&apos;s find out where you really stand. Fifteen minutes, eleven skills, no self-assessment.</>
            ) : (
              <>
                Your weakest link right now is <span className="marker text-ink">{skillLabel(sorted[0]?.id ?? "register").toLowerCase()}</span>.{" "}
                {d.due > 0 ? `${d.due} cards are waiting` : "Nothing is overdue"}
                {d.dueMistakes > 0 ? `, ${d.dueMistakes} of them your own mistakes.` : "."}
              </>
            )}
          </p>
        </div>

        <div className="edition-strip"><span>YOUR ENGLISH STUDIO</span><span>{settings.currentLevel ?? "B2"} <span className="text-accent">→</span> {settings.targetLevel ?? "C2"}</span><span>{minutes} MIN / DAY</span></div>
        <LearningLibraryCard/>
        {/* ---------- hero row ---------- */}
        <div className="grid lg:grid-cols-12 gap-4 mt-6 stagger">
          {!d.assessed ? (
            <section className="lg:col-span-7 card overflow-hidden p-8 sm:p-10 flex flex-col min-h-[340px]">
              <Deco text="?" />
              <span className="kicker text-accent!">Start here</span>
              <h2 className="font-display text-[40px] sm:text-[48px] leading-[1] mt-4 max-w-md">
                Measure, <em>don&apos;t</em> guess.
              </h2>
              <p className="text-muted mt-4 max-w-md leading-relaxed">
                A diagnostic across grammar, vocabulary, collocations, register, nuance, structure and writing. Everything else adapts from its results.
              </p>
              <div className="flex flex-wrap items-center gap-3 mt-auto pt-8">
                <LinkButton href="/assessment" variant="primary" size="lg">
                  Take the diagnostic <Icon name="arrow" className="size-4 transition-transform group-hover/btn:translate-x-1" />
                </LinkButton>
                <LinkButton href="/session" variant="ghost">Skip, just practise</LinkButton>
              </div>
            </section>
          ) : (
            <section className="lg:col-span-7 card overflow-hidden p-8 sm:p-10 flex flex-col min-h-[340px]">
              <Deco text={String(minutes)} />
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-accent pulse-dot" />
                <span className="kicker text-accent!">{hour >= 17 || hour < 5 ? "Tonight's session" : "Today's session"}</span>
              </div>
              <h2 className="font-display text-[40px] sm:text-[48px] leading-[1] mt-4">
                {minutes} minutes, <em>built for you.</em>
              </h2>
              {/* the three movements of a session */}
              <div className="grid grid-cols-3 gap-2 mt-8 max-w-lg">
                {[
                  { k: "01", t: "Review", s: d.due ? `${d.due} due` : "light" },
                  { k: "02", t: "Practice", s: sorted.slice(0, 2).map((x) => SKILLS.find((m) => m.id === x.id)?.short).join(" · ") },
                  { k: "03", t: "Produce", s: "rewrite, write" },
                ].map((b, i) => (
                  <div key={b.k} className="relative">
                    <div className={cx("h-[3px] rounded-full", i === 0 ? "bg-accent" : "bg-surface-3")} />
                    <p className="mono text-[10px] text-faint mt-3">{b.k}</p>
                    <p className="text-[15px] font-semibold mt-0.5">{b.t}</p>
                    <p className="text-[12.5px] text-muted truncate">{b.s}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-auto pt-9">
                <LinkButton href="/session" variant="primary" size="lg">
                  Start session <Icon name="arrow" className="size-4 transition-transform group-hover/btn:translate-x-1" />
                </LinkButton>
                <LinkButton href="/challenge" variant="secondary" size="lg">
                  <Icon name="bolt" className="size-4" /> Challenge
                </LinkButton>
                <span className="hidden sm:flex items-center gap-1.5 text-[12px] text-faint ml-1">
                  or press <kbd className="kbd">S</kbd>
                </span>
              </div>
            </section>
          )}

          <section className="lg:col-span-5 card p-8 sm:p-10 flex flex-col">
            <div className="flex items-center justify-between">
              <span className="kicker">Estimated level</span>
              <span className="mono text-[10px] text-faint">internal indicator</span>
            </div>
            <div className="flex items-end gap-4 mt-3">
              <span className="font-display text-[112px] leading-[0.8] tracking-[-0.04em]">{level}</span>
              <div className="pb-2 text-[13px] text-muted leading-snug">
                {nextBand ? (
                  <>
                    <span className="text-ink font-semibold num">{Math.ceil(nextBand.min - overall)} pts</span>
                    <br />
                    to {nextBand.level}
                  </>
                ) : (
                  "Top band"
                )}
              </div>
            </div>
            <LevelRuler rating={overall} />
            <div className="hairline" />
            <div className="grid grid-cols-2 gap-4 pt-5 mt-auto">
              <div>
                <p className="kicker !text-[9.5px]">Success · 7 days</p>
                <p className="font-display text-[30px] mt-1">{d.successWeek === null ? "–" : <CountUp value={Math.round(d.successWeek * 100)} suffix="%" />}</p>
              </div>
              <div>
                <p className="kicker !text-[9.5px]">Answers today</p>
                <p className="font-display text-[30px] mt-1">
                  <CountUp value={d.answersToday} />
                  <span className="text-faint text-[18px]">/{settings.dailyGoal}</span>
                </p>
              </div>
            </div>
          </section>
        </div>

        <div className="studio-invitation"><div><span className="kicker">Made for your mind</span><h2 className="font-display text-3xl mt-2">Your interests. <em>Your English.</em></h2><p className="text-sm text-muted mt-3">{settings.goals || "Turn your interests and recurring mistakes into focused practice."}</p></div><LinkButton href="/studio">Open AI Studio <Icon name="arrow"/></LinkButton></div>
        {/* ---------- skill map ---------- */}
        <section className="mt-20">
          <SectionTitle kicker="Section A" title={<>The skill <em>map</em></>} aside="0–100 internal scale · change over 7 days" />
          <div className="card p-6 sm:p-10 grid lg:grid-cols-[1fr_1.15fr] gap-10 items-center">
            <div className="max-w-[420px] mx-auto w-full px-6">
              <SkillRadar skills={d.skills} active={hover} onHover={setHover} />
            </div>
            <div>
              {SKILLS.map((meta) => {
                const s = d.skills.find((x) => x.id === meta.id);
                if (meta.requiresAudio)
                  return (
                    <div key={meta.id} className="flex items-center gap-3 py-2.5 text-faint">
                      <span className="w-36 sm:w-44 text-[14px] flex items-center gap-2">
                        <Icon name="mic" className="size-3.5" />
                        {meta.label}
                      </span>
                      <span className="text-[12px] mono">needs audio · not assessed</span>
                    </div>
                  );
                const r = s?.rating ?? 55;
                const t = s ? trend(s.history, r) : 0;
                const on = hover === meta.id;
                return (
                  <div
                    key={meta.id}
                    onMouseEnter={() => setHover(meta.id)}
                    onMouseLeave={() => setHover(null)}
                    className={cx("flex items-center gap-3 py-2.5 -mx-3 px-3 rounded-lg transition-colors", on && "bg-surface-2")}
                    title={meta.description}
                  >
                    <span className="w-36 sm:w-44 shrink-0 text-[14px]">{meta.label}</span>
                    <Bar value={r / 100} className="flex-1" tone={r >= 70 ? "good" : r >= 58 ? "accent" : "warn"} />
                    <span className="w-8 text-right text-[13px] mono num">{Math.round(r)}</span>
                    <span className="w-9 text-[12px] font-semibold text-muted">{ratingToLevel(r)}</span>
                    <span className={cx("hidden sm:inline w-8 text-right text-[11px] mono", t > 0.5 ? "text-good" : t < -0.5 ? "text-bad" : "text-faint")}>
                      {Math.abs(t) < 0.5 ? "·" : `${t > 0 ? "+" : ""}${t.toFixed(0)}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ---------- numbers ---------- */}
        <section className="mt-20">
          <SectionTitle kicker="Section B" title={<>By the <em>numbers</em></>} />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-line rounded-[18px] overflow-hidden border border-line">
            {[
              { l: "Words mastered", v: d.wordsMastered, s: `${d.itemsTotal} items in your lists` },
              { l: "Expressions mastered", v: d.exprMastered, s: "idioms, phrasal verbs, collocations" },
              { l: "Recurring mistakes", v: d.recurring, s: `${d.mistakesTotal} logged in total` },
              { l: "Minutes this week", v: Math.round(d.timeWeek / 60000), s: `${formatMinutes(d.timeTotal)} in total` },
            ].map((x) => (
              <div key={x.l} className="bg-surface p-6 sm:p-7 hover:bg-surface-2 transition-colors">
                <Stat label={x.l} value={<CountUp value={x.v} />} sub={x.s} />
              </div>
            ))}
          </div>
        </section>

        {/* ---------- focus / activity / recent ---------- */}
        <section className="mt-4 grid lg:grid-cols-3 gap-4">
          <div className="card p-7">
            <p className="kicker">Focus next</p>
            <ol className="mt-5 space-y-4">
              {sorted.slice(0, 3).map((s, i) => (
                <li key={s.id} className="flex items-baseline gap-4">
                  <span className="font-display italic-display text-[28px] text-accent leading-none w-6">{i + 1}</span>
                  <span className="flex-1 text-[15px]">{skillLabel(s.id)}</span>
                  <span className="mono text-[11px] text-muted">{ratingToLevel(s.rating)}</span>
                </li>
              ))}
            </ol>
            {d.weakTags.length > 0 && (
              <div className="mt-5 pt-4 border-t border-line flex flex-wrap gap-1.5">
                <span className="text-[12px] text-faint mr-1">Recent misses:</span>
                {d.weakTags.map(([t]) => (
                  <Chip key={t} tone="bad">{t.replace(/-/g, " ")}</Chip>
                ))}
              </div>
            )}
          </div>
          <div className="card p-7">
            <div className="flex items-baseline justify-between">
              <p className="kicker">Activity</p>
              <p className="mono text-[10.5px] text-faint">14 weeks</p>
            </div>
            <div className="mt-5">
              <Heatmap activity={d.activity} now={d.now} />
            </div>
            <div className="flex items-center justify-between mt-5 text-[12.5px] text-muted">
              <span className="flex items-center gap-1.5">
                <Icon name="flame" className={cx("size-4", d.streak ? "text-ember flicker" : "text-faint")} />
                {d.streak} day streak
              </span>
              <span>{d.due} due today</span>
            </div>
          </div>
          <div className="card p-7">
            <div className="flex items-baseline justify-between">
              <p className="kicker">Recently learned</p>
              <Link href="/vocabulary" className="text-[12px] text-accent link">All words</Link>
            </div>
            {d.recent.length ? (
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-4">
                {d.recent.map((it, k) => (
                  <span key={it.id} className="font-display italic-display text-[21px]">
                    {it.text}
                    {k < d.recent.length - 1 && <span className="text-faint not-italic">,</span>}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[14px] text-muted mt-4 leading-relaxed">
                New words show up here once they appear in a session. <span className="text-ink">{d.newAvailable}</span> are waiting in your lists.
              </p>
            )}
          </div>
        </section>
      </Page>

      {/* ---------- the ticker ---------- */}
      <div className="mt-10 mb-6">
        <p className="kicker text-center mb-3">From your lists</p>
        <WordTicker words={d.words.slice(0, 40)} />
      </div>
    </div>
  );
}

function SectionTitle({ kicker, title, aside }: { kicker: string; title: React.ReactNode; aside?: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div>
        <p className="kicker mb-2">{kicker}</p>
        <h2 className="font-display text-[38px] sm:text-[44px] leading-none">{title}</h2>
      </div>
      {aside && <span className="mono text-[10.5px] text-faint">{aside}</span>}
    </div>
  );
}

/** Oversized outlined numeral in the corner of a card. */
function Deco({ text }: { text: string }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute -right-4 -bottom-14 font-display italic-display text-[260px] leading-none text-transparent select-none"
      style={{ WebkitTextStroke: "1px var(--line-strong)" }}
    >
      {text}
    </span>
  );
}
