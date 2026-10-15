"use client";

import { useMemo, useState } from "react";
import { NUANCE_SETS, type NuanceSet } from "@/content/nuance";
import { Card, Chip, Page, PageHeader, RegisterChip } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { ExercisePlayer, type Outcome } from "@/components/ExercisePlayer";
import { recordAttempt } from "@/lib/db/repo";
import { useSettings } from "@/lib/hooks";
import type { McqExercise } from "@/lib/types";
import { shuffle } from "@/lib/util";

const SCALE = ["casual", "neutral", "professional", "formal", "academic", "literary"] as const;

export default function NuancePage() {
  const [set, setSet] = useState<NuanceSet | null>(null);
  if (set) return <SetView set={set} onBack={() => setSet(null)} />;
  return (
    <Page>
      <PageHeader
        kicker="Register & Nuance"
        title={<>Words are not <em className="text-accent">interchangeable.</em></>}
        lede="Higher is not better. The right word is the one that fits the context: “commence” in a stand-up sounds as odd as “kids” in a police report."
      />
      <div className="card p-7 mb-10">
        <p className="kicker mb-6">The register spectrum · from speech to print</p>
        <div className="relative">
          <div className="h-[6px] rounded-full bg-[linear-gradient(90deg,var(--warn),var(--muted)_28%,var(--good)_48%,var(--accent)_75%,var(--ink))] opacity-80" />
          <div className="grid grid-cols-6 mt-4">
            {SCALE.map((r, i) => (
              <div key={r} className={i === 0 ? "text-left" : i === SCALE.length - 1 ? "text-right" : "text-center"}>
                <p className="font-display italic-display text-[18px] sm:text-[22px]">{r}</p>
                <p className="mono text-[10px] text-faint mt-1">{["kids", "children", "young people", "minors", "adolescents", "the young"][i]}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-4 stagger">
        {NUANCE_SETS.map((s) => (
          <button key={s.id} onClick={() => setSet(s)} className="card card-hover p-7 text-left group">
            <p className="kicker">{s.idea}</p>
            <p className="font-display text-[26px] mt-3 leading-tight group-hover:text-accent transition-colors">{s.title}</p>
            <p className="text-[13px] text-muted mt-2 line-clamp-2">{s.takeaway}</p>
          </button>
        ))}
      </div>
    </Page>
  );
}

function SetView({ set, onBack }: { set: NuanceSet; onBack: () => void }) {
  const settings = useSettings();
  const [drill, setDrill] = useState<number | null>(null);
  const [score, setScore] = useState<number[]>([]);
  const exercises: McqExercise[] = useMemo(
    () =>
      set.drills.map((d, i) => {
        const options = shuffle(set.words.map((w) => w.word));
        const correct = set.words.find((w) => d.answer.toLowerCase().startsWith(w.word.toLowerCase()))?.word ?? d.answer;
        return {
          id: `nuance:${set.id}:${i}`,
          type: "mcq",
          skills: ["nuance", "register"],
          difficulty: 64,
          tags: ["near synonyms", set.id],
          instruction: "Which word fits best? (Form may need adjusting.)",
          prompt: d.prompt,
          options,
          answer: options.indexOf(correct),
          explanation: d.why,
          estSeconds: 15,
          origin: "bank",
        };
      }),
    [set],
  );

  async function done(o: Outcome) {
    const ex = exercises[drill!];
    await recordAttempt({ ex, result: o.result, answer: o.answer, durationMs: o.durationMs, mode: "nuance" });
    setScore([...score, o.result.score]);
    setDrill(drill! + 1 < exercises.length ? drill! + 1 : -1);
  }

  return (
    <Page>
      <button onClick={onBack} className="text-muted hover:text-ink text-[14px] inline-flex items-center gap-1 mb-8">
        <Icon name="back" /> All families
      </button>
      <p className="kicker">{set.idea}</p>
      <h1 className="font-display text-[40px] sm:text-[52px] leading-[1] mt-3">{set.title}</h1>
      <p className="text-muted mt-3 max-w-3xl">{set.takeaway}</p>

      <div className="mt-8 grid gap-3">
        {set.words.map((w) => (
          <Card key={w.word} className="p-5 grid md:grid-cols-[180px_1fr] gap-4">
            <div>
              <p className="font-display italic-display text-[32px] leading-none">{w.word}</p>
              <div className="flex flex-wrap gap-1 mt-3">
                <RegisterChip r={w.register} />
                <Chip tone={w.connotation === "positive" ? "good" : w.connotation === "negative" ? "bad" : "neutral"}>{w.connotation}</Chip>
              </div>
              <p className="text-[12px] text-faint mt-2">{w.frequency}</p>
            </div>
            <div>
              <p className="text-[14px]">{w.note}</p>
              <p className="font-display text-[18px] text-muted mt-3 leading-snug">“{w.example}”</p>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {w.collocations.map((c) => (
                  <span key={c} className="text-[12px] rounded-md border border-line px-2 py-0.5 text-muted">{c}</span>
                ))}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <section className="mt-10 max-w-2xl">
        <h2 className="font-display text-[26px] mb-4">Quick check</h2>
        {drill === null && (
          <button onClick={() => setDrill(0)} className="card p-5 w-full text-left hover:border-accent transition-colors flex items-center justify-between">
            <span>{exercises.length} contexts: pick the word that fits</span>
            <Icon name="arrow" />
          </button>
        )}
        {drill !== null && drill >= 0 && (
          <Card className="p-6">
            <ExercisePlayer key={drill} ex={exercises[drill]} settings={settings} onDone={done} />
          </Card>
        )}
        {drill === -1 && (
          <Card className="p-6">
            <p className="font-medium">
              {score.filter((s) => s >= 0.85).length}/{score.length} right.
            </p>
            <p className="text-muted text-[14px] mt-1">Results feed your Nuance and Register ratings.</p>
            <button className="text-accent text-[14px] mt-3" onClick={() => { setScore([]); setDrill(0); }}>Try again</button>
          </Card>
        )}
      </section>
    </Page>
  );
}
