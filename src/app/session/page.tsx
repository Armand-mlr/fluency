"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { loadContext } from "@/lib/hooks";
import { buildDailySession, buildReview, est, type Planned } from "@/lib/engine/session";
import { exerciseForItem, exerciseForMistake } from "@/lib/engine/generator";
import { SessionRunner } from "@/components/SessionRunner";
import { Button, Chip, Empty, LinkButton } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { skillLabel } from "@/lib/engine/levels";
import { cardId, newCard } from "@/lib/engine/srs";
import { cx, shuffle } from "@/lib/util";
import type { Card } from "@/lib/types";

export default function SessionPage() {
  return (
    <Suspense fallback={null}>
      <SessionInner />
    </Suspense>
  );
}

function SessionInner() {
  const params = useSearchParams();
  const mode = params.get("mode") ?? "daily";
  const list = params.get("list");
  const itemId = params.get("item");
  const [plan, setPlan] = useState<Planned[] | null>(null);
  const [title, setTitle] = useState("Today's session");
  const [go, setGo] = useState(false);

  useEffect(() => {
    loadContext().then((ctx) => {
      const cardsById = new Map(ctx.cards.map((c) => [c.id, c]));
      const cardFor = (refType: Card["refType"], refId: string, facet: Card["facet"]) =>
        cardsById.get(cardId(refType, refId, facet)) ?? newCard(refType, refId, facet);

      if (mode === "item" && itemId) {
        const item = ctx.items.find(i => i.id === itemId);
        setTitle(item?.text ?? "Vocabulary practice");
        setPlan(item ? (["recognize", "produce", "use"] as const).map(facet => ({ ex: exerciseForItem(item, cardFor("item", item.id, facet), ctx.items), block: "practice" as const, reason: facet })) : []);
      } else if (mode === "mistakes") {
        setTitle("My mistakes");
        const ms = [...ctx.mistakes].sort((a, b) => b.count - a.count).slice(0, 12);
        setPlan(shuffle(ms).map((m) => ({ ex: exerciseForMistake(m, cardFor("mistake", m.id, "fix")), block: "review" as const, reason: `Made ${m.count}×` })));
      } else if (mode === "list" && list) {
        const items = ctx.items.filter((it) => it.listIds.includes(list));
        setTitle("List practice");
        const plan = shuffle(items)
          .slice(0, 15)
          .map((it) => {
            // pick the weakest unlocked facet for this item
            const facets = (["recognize", "produce", "use"] as const)
              .map((f) => cardFor("item", it.id, f))
              .filter((c) => !c.suspended);
            const weakest = facets.sort((a, b) => (a.state === "new" ? -1 : 0) - (b.state === "new" ? -1 : 0) || b.difficulty - a.difficulty || a.interval - b.interval)[0];
            return { ex: exerciseForItem(it, weakest, ctx.items), block: "review" as const, reason: weakest.state === "new" ? "New" : weakest.facet };
          });
        setPlan(plan);
      } else if (mode === "review") {
        setTitle("Review only");
        setPlan(buildReview(ctx, 20 * 60));
      } else {
        setPlan(buildDailySession(ctx));
      }
    });
  }, [mode, list, itemId]);

  if (!plan) return <div className="p-10 text-muted text-sm">Preparing your session…</div>;

  if (!plan.length)
    return (
      <div className="mx-auto max-w-xl px-6 py-16">
        <Empty title="Nothing to practise here yet">
          {mode === "list" ? "This list has no items. Add some words first." : mode === "mistakes" ? "No mistakes logged yet. They'll appear as you practise." : "You're all caught up."}
          <div className="mt-4">
            <LinkButton href="/">Back</LinkButton>
          </div>
        </Empty>
      </div>
    );

  if (go) return <SessionRunner plan={plan} mode="session" sessionMode={mode === "daily" ? "daily" : "review"} />;

  const minutes = Math.max(1, Math.round(plan.reduce((s, p) => s + est(p.ex), 0) / 60));
  const blocks = (["review", "practice", "production"] as const).map((b) => ({ b, items: plan.filter((p) => p.block === b) })).filter((x) => x.items.length);
  const skills = [...new Set(plan.map((p) => p.ex.skills[0]))];

  const total = plan.reduce((s, p) => s + est(p.ex), 0);
  return (
    <div className="mx-auto max-w-3xl px-5 sm:px-6 py-10 md:py-16">
      <div className="stagger">
        <Link href="/" className="text-muted hover:text-ink text-[13px] inline-flex items-center gap-1.5 mb-12 mono uppercase tracking-[0.14em]">
          <Icon name="back" className="size-3.5" /> Today
        </Link>
        <div className="flex items-center gap-3">
          <span className="kicker">≈ {minutes} min · {plan.length} exercises</span>
          <span className="hairline flex-1" />
        </div>
        <h1 className="font-display text-[56px] sm:text-[80px] leading-[0.92] mt-5">
          {title.split(" ").slice(0, -1).join(" ")} <em className="text-accent">{title.split(" ").slice(-1)}</em>
        </h1>

        {/* proportional timeline of the session */}
        <div className="flex gap-1.5 mt-12 h-2">
          {blocks.map(({ b, items }, k) => (
            <div
              key={b}
              className={cx("rounded-full", k === 0 ? "bg-accent" : k === 1 ? "bg-accent/55" : "bg-accent/25")}
              style={{ flex: items.reduce((s, p) => s + est(p.ex), 0) / total }}
            />
          ))}
        </div>
        <div className="grid sm:grid-cols-3 gap-6 mt-6">
          {blocks.map(({ b, items }, k) => (
            <div key={b}>
              <p className="mono text-[10.5px] text-faint">
                {String(k + 1).padStart(2, "0")} · {Math.max(1, Math.round(items.reduce((s, p) => s + est(p.ex), 0) / 60))} min
              </p>
              <p className="font-display text-[28px] capitalize mt-1">{b}</p>
              <p className="text-[13.5px] text-muted mt-1 leading-relaxed">
                <span className="text-ink font-semibold">{items.length}</span>{" "}
                {b === "review" &&
                  `items: ${items.filter((p) => p.reason === "Your mistake").length} of your mistakes, ${items.filter((p) => p.reason === "New").length} new, the rest due.`}
                {b === "practice" && "exercises chosen for your weakest skills and recent misses."}
                {b === "production" && "tasks to rewrite, reformulate and write."}
              </p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5 mt-10">
          {skills.map((s) => (
            <Chip key={s}>{skillLabel(s)}</Chip>
          ))}
        </div>
        <div className="flex items-center gap-4 mt-12">
          <Button variant="primary" size="lg" onClick={() => setGo(true)} autoFocus>
            Begin <Icon name="arrow" className="size-4 transition-transform group-hover/btn:translate-x-1" />
          </Button>
          <span className="text-[12px] text-faint mono flex items-center gap-1.5">
            <kbd className="kbd">↵</kbd> to begin
          </span>
        </div>
      </div>
    </div>
  );
}
