"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/schema";
import { LADDERS, type Ladder } from "@/content/writing";
import { BANK, CHALLENGES } from "@/content";
import { Button, Card, Chip, Page, PageHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { ExercisePlayer, type Outcome } from "@/components/ExercisePlayer";
import { recordAttempt } from "@/lib/db/repo";
import { useSettings } from "@/lib/hooks";
import { getProvider } from "@/lib/ai/provider";
import type { Exercise, FreeExercise, GradeResult } from "@/lib/types";
import { AIDiagnostics } from "@/components/AIDiagnostics";
import { AIReviewDetails } from "@/components/AIReviewDetails";
import { cx } from "@/lib/util";

const TASKS = [...BANK, ...CHALLENGES].filter((e) => e.type === "free" && e.skills.includes("writing"));

export default function WritingPage() {
  const [ladder, setLadder] = useState<Ladder | null>(null);
  const [task, setTask] = useState<Exercise | null>(null);
  const done = useLiveQuery(() => db.attempts.where("mode").equals("writing").toArray(), []) ?? [];
  const doneIds = new Set(done.map((a) => a.exerciseId));

  if (ladder) return <LadderView ladder={ladder} onBack={() => setLadder(null)} />;
  if (task) return <TaskView ex={task} onBack={() => setTask(null)} />;

  return (
    <Page>
      <PageHeader
        kicker="Writing Lab · upgrade sentences, not just vocabulary"
        title={<>From flat to <em className="text-accent">precise.</em></>}
        lede="Each ladder starts from a correct but flat B2 sentence. You try first, then watch it climb to C1 and C2, with every move named and explained. More precise and better suited to the context, not more complicated."
      />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
        {LADDERS.map((l, i) => (
          <button key={l.id} onClick={() => setLadder(l)} className="card card-hover p-6 text-left flex flex-col min-h-[230px] group">
            <div className="flex justify-between items-center">
              <span className="mono text-[10.5px] text-faint">{String(i + 1).padStart(2, "0")} · {l.context}</span>
              {doneIds.has(`ladder:${l.id}`) ? <Icon name="check" className="size-4 text-good" /> : <Icon name="arrow" className="size-4 text-faint group-hover:text-accent group-hover:translate-x-1 transition-all" />}
            </div>
            <p className="font-display text-[28px] mt-5 leading-[1.05]">{l.title}</p>
            <p className="font-display italic-display text-[16px] text-muted mt-auto pt-6 leading-snug line-clamp-3">“{l.base}”</p>
            <div className="flex gap-1 mt-4">
              {["B2", "C1", "C2"].map((lv, k) => (
                <span key={lv} className={cx("flex-1 h-[3px] rounded-full", k === 0 ? "bg-line-strong" : k === 1 ? "bg-accent/50" : "bg-accent")} />
              ))}
            </div>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 mt-20 mb-6"><h2 className="font-display text-[40px] leading-none">Writing <em>tasks</em></h2><span className="hairline flex-1" /></div>
      <div className="grid sm:grid-cols-2 gap-3">
        {TASKS.map((t) => (
          <button key={t.id} onClick={() => setTask(t)} className="card card-hover p-6 text-left">
            <div className="flex gap-2 items-center">
              {t.tags.slice(0, 2).map((x) => (
                <Chip key={x}>{x}</Chip>
              ))}
              {doneIds.has(t.id) && <Icon name="check" className="size-4 text-good ml-auto" />}
            </div>
            <p className="font-display text-[21px] leading-snug mt-4">{t.instruction}</p>
            <p className="text-[13px] text-muted mt-1 line-clamp-2">{(t as FreeExercise).prompt}</p>
          </button>
        ))}
      </div>
    </Page>
  );
}

function TaskView({ ex, onBack }: { ex: Exercise; onBack: () => void }) {
  const settings = useSettings();
  async function done(o: Outcome) {
    await recordAttempt({ ex, result: o.result, answer: o.answer, durationMs: o.durationMs, mode: "writing" });
    onBack();
  }
  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-8 md:py-12">
      <button onClick={onBack} className="text-muted hover:text-ink text-[14px] inline-flex items-center gap-1 mb-8">
        <Icon name="back" /> Writing Lab
      </button>
      <ExercisePlayer ex={ex} settings={settings} onDone={done} />
    </div>
  );
}

function LadderView({ ladder, onBack }: { ladder: Ladder; onBack: () => void }) {
  const settings = useSettings();
  const ai = getProvider(settings);
  const [text, setText] = useState("");
  const [start] = useState(() => Date.now());
  const [shown, setShown] = useState(0); // steps revealed
  const [submitted, setSubmitted] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiResult, setAiResult] = useState<(GradeResult & { improved?: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [rated, setRated] = useState(false);
  const controller=useRef<AbortController|null>(null);
  useEffect(()=>()=>controller.current?.abort(),[]);

  const top = ladder.steps[ladder.steps.length - 1];
  const asExercise: FreeExercise = {
    id: `ladder:${ladder.id}`,
    type: "free",
    skills: ["writing", "register", "precision"],
    difficulty: 70,
    tags: ["sentence upgrade", ladder.context.toLowerCase()],
    instruction: `Improve this sentence. Goal: ${ladder.goal}`,
    prompt: ladder.base,
    model: top.text,
    rubric: ["More precise vocabulary", "Better sentence structure", "Register suits the context", "Still natural, not over-complicated"],
  };

  async function submit() {
    if(busy||rated)return;
    setAiError("");
    const abort=new AbortController();controller.current=abort;
    setSubmitted(true);
    setShown(1);
    if (ai && text.trim()) {
      setBusy(true);
      try {
        const r = await ai.gradeProduction(asExercise, text,abort.signal);
        if(abort.signal.aborted)return;
        setAiResult(r);
        await recordAttempt({ ex: asExercise, result: r, answer: text, durationMs: Date.now() - start, mode: "writing" });
        setRated(true);
      } catch (e) {
        setAiError((e as Error).message);
      } finally {
        setBusy(false);
      }
    }
  }

  async function rate(score: number) {
    if(busy||rated)return;
    await recordAttempt({ ex: asExercise, result: { score, verdict: score >= 0.85 ? "correct" : score >= 0.5 ? "close" : "wrong" }, answer: text, durationMs: Date.now() - start, mode: "writing" });
    setRated(true);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-8 md:py-12 rise">
      <button onClick={onBack} className="text-muted hover:text-ink text-[14px] inline-flex items-center gap-1 mb-8">
        <Icon name="back" /> Writing Lab
      </button>
      <p className="kicker">{ladder.context} · {ladder.register}</p>
      <h1 className="font-display text-[48px] sm:text-[60px] leading-[0.95] mt-3">{ladder.title}</h1>
      <p className="text-muted mt-2">{ladder.goal}</p>

      <Step level="B2" text={ladder.base} />

      {!submitted ? (
        <div className="mt-6">
          <p className="text-[14px] font-medium mb-2">Your turn first: rewrite it better.</p>
          <textarea className="field min-h-28 text-[16px]" value={text} onChange={(e) => setText(e.target.value)} autoFocus placeholder="Your upgraded version…" />
          <div className="flex gap-2 mt-3 justify-end">
            <Button variant="ghost" onClick={()=>{setText("");setSubmitted(true);setShown(1);}}>Just show me</Button>
            <Button variant="primary" disabled={!text.trim()} onClick={submit}>Submit</Button>
          </div>
        </div>
      ) : (
        text.trim() && (
          <div className="mt-4 rounded-xl bg-surface-2 p-4">
            <span className="text-[11px] uppercase tracking-wider text-faint">Your version</span>
            <p className="text-[16px] mt-1">{text}</p>
            {busy && <p className="text-[13px] text-muted mt-2">Analysing… <Button size="sm" onClick={()=>controller.current?.abort()}>Annuler</Button></p>}
            {(!ai || aiError) && <p className="text-sm text-warn mt-3">{aiError || "Correction IA non configurée."} Autoévaluation disponible. <a className="link" href="/settings#ai">Réglages IA</a>{aiError && <Button size="sm" onClick={submit} disabled={busy}>Réessayer</Button>}</p>}
            {aiResult && (
              <div className="mt-3 text-[14px]">
                <p className="whitespace-pre-wrap">{aiResult.feedback}</p><AIReviewDetails result={aiResult}/>
                {aiResult.improved && <p className="mt-2"><span className="text-muted">Improved: </span>{aiResult.improved}</p>}
              </div>
            )}
          </div>
        )
      )}

      {ai&&<AIDiagnostics/>}
      {ladder.steps.slice(0, shown).map((s) => (
        <div key={s.level} className="rise">
          <Step level={s.level} text={s.text} />
          <div className="ml-12 mt-3">
            <ul className="space-y-1">
              {s.moves.map((m) => (
                <li key={m} className="text-[14px] flex gap-2">
                  <span className="text-accent">→</span>
                  {m}
                </li>
              ))}
            </ul>
            <p className="text-[14px] text-muted mt-3 leading-relaxed">{s.why}</p>
          </div>
        </div>
      ))}

      {submitted && shown < ladder.steps.length && (
        <Button className="mt-6 ml-12" onClick={() => setShown(shown + 1)}>
          Climb to {ladder.steps[shown].level} <Icon name="arrow" />
        </Button>
      )}

      {submitted && shown >= ladder.steps.length && (
        <div className="mt-10 rise">
          <h3 className="font-display text-[24px] mb-3">Other good options, other contexts</h3>
          <div className="space-y-2">
            {ladder.alternatives.map((a) => (
              <Card key={a.text} className="p-4">
                <p className="text-[15px]">{a.text}</p>
                <p className="text-[12px] text-muted mt-1">{a.when}</p>
              </Card>
            ))}
          </div>
          {text.trim() && !rated && !busy && (
            <div className="mt-8">
              <p className="text-[14px] font-medium mb-2">Honestly, your version reached…</p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => rate(0.3)}>Still B2</Button>
                <Button onClick={() => rate(0.7)}>About C1</Button>
                <Button onClick={() => rate(1)}>C2 or equivalent</Button>
              </div>
            </div>
          )}
          {(rated || !text.trim()) && (
            <Button variant="primary" className="mt-8" onClick={onBack}>
              Back to the lab
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function Step({ level, text }: { level: string; text: string }) {
  return (
    <div className="flex gap-4 items-start mt-6">
      <span className={cx("shrink-0 size-8 rounded-full grid place-items-center text-[11px] font-semibold", level === "B2" ? "bg-surface-2 text-muted" : level === "C1" ? "bg-accent-soft text-accent" : "bg-accent text-accent-ink")}>
        {level}
      </span>
      <p className={cx("font-display leading-snug", level === "B2" ? "text-[24px] text-muted" : "text-[26px]")}>{text}</p>
    </div>
  );
}
