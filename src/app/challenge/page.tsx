"use client";

import { useEffect, useState } from "react";
import { loadContext } from "@/lib/hooks";
import { buildChallenge, est, type Planned } from "@/lib/engine/session";
import { CHALLENGES } from "@/content";
import { SessionRunner } from "@/components/SessionRunner";
import { Button, Chip, Page, PageHeader, Segmented } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { skillLabel } from "@/lib/engine/levels";

export default function ChallengePage() {
  const [plan, setPlan] = useState<Planned[] | null>(null);
  const [count, setCount] = useState(3);
  const [go, setGo] = useState(false);

  useEffect(() => {
    loadContext().then((ctx) => setPlan(buildChallenge(ctx, CHALLENGES, count)));
  }, [count]);

  if (go && plan) return <SessionRunner plan={plan} mode="challenge" sessionMode="challenge" />;

  const minutes = plan ? Math.round(plan.reduce((s, p) => s + est(p.ex), 0) / 60) : 0;

  return (
    <Page>
      <PageHeader
        kicker="Hard mode · 8 to 20 points above your level"
        title={
          <>
            Step <em className="text-ember">outside.</em>
          </>
        }
        lede="Tasks that should feel slightly too hard. Struggling here is the point: it's where C1 turns into C2. Long answers are graded against a rubric, or by the AI if you've configured one."
      />

      <div className="flex flex-wrap items-center gap-4 mb-8">
        <Segmented value={count} options={[1, 3, 5]} onChange={setCount} format={(n) => `${n} task${n > 1 ? "s" : ""}`} />
        {plan && <span className="mono text-[11px] text-faint">≈ {minutes} min</span>}
      </div>

      {plan && (
        <div className="stagger border-t border-line">
          {plan.map((p, i) => (
            <article key={p.ex.id} className="group grid grid-cols-[56px_1fr] sm:grid-cols-[88px_1fr_auto] gap-x-6 gap-y-2 py-8 border-b border-line">
              <span className="font-display italic-display text-[52px] sm:text-[72px] leading-[0.8] text-line-strong group-hover:text-ember transition-colors duration-500">
                {i + 1}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-3">
                  <Chip tone="warn">{skillLabel(p.ex.skills[0])}</Chip>
                  <span className="mono text-[10.5px] text-faint">≈ {Math.max(1, Math.round(est(p.ex) / 60))} min</span>
                </div>
                <p className="font-display text-[24px] sm:text-[28px] leading-snug">{p.ex.instruction}</p>
                {"prompt" in p.ex && p.ex.prompt && (
                  <p className="text-muted text-[14.5px] mt-3 leading-relaxed line-clamp-2 max-w-2xl">{p.ex.prompt}</p>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="mt-10 flex items-center gap-4">
        <Button variant="primary" size="lg" onClick={() => setGo(true)} disabled={!plan?.length}>
          <Icon name="bolt" className="size-4" /> Accept the challenge
        </Button>
        <span className="text-[13px] text-faint">No hints. No shortcuts.</span>
      </div>
    </Page>
  );
}
