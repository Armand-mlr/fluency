"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/schema";
import { DIAGNOSTIC } from "@/content/diagnostic";
import { ExercisePlayer, type Outcome } from "@/components/ExercisePlayer";
import { Bar, Button, Card, Chip, LinkButton, Page, PageHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { FocusBar } from "@/components/SessionRunner";
import { SkillRadar } from "@/components/viz";
import { useFocusMode, useSettings } from "@/lib/hooks";
import { applyTestAnalysis, recordAttempt, saveAssessment, setSkillRatings, updateSettings } from "@/lib/db/repo";
import { ACTIVE_SKILLS, SKILLS, ratingToLevel, skillLabel } from "@/lib/engine/levels";
import { DEFAULT_RATING } from "@/lib/engine/skills";
import { AIDiagnostics } from "@/components/AIDiagnostics";
import { getProvider } from "@/lib/ai/provider";
import type { SkillId } from "@/lib/types";

type Phase = "intro" | "run" | "results";

export default function AssessmentPage() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [i, setI] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [outs, setOuts] = useState<Outcome[]>([]);
  useFocusMode(phase === "run");
  const settings = useSettings();
  const assessments = useLiveQuery(() => db.assessments.orderBy("date").reverse().toArray(), []) ?? [];

  async function begin() {
    // the diagnostic measures from scratch: reset the ratings it covers
    const reset: Partial<Record<SkillId, number>> = {};
    for (const s of ACTIVE_SKILLS) reset[s] = DEFAULT_RATING;
    await setSkillRatings(reset);
    for (const s of ACTIVE_SKILLS) {
      const cur = await db.skills.get(s);
      if (cur) await db.skills.put({ ...cur, attempts: 0 });
    }
    setStartedAt(Date.now());
    setOuts([]);
    setI(0);
    setPhase("run");
  }

  async function onDone(o: Outcome) {
    const ex = DIAGNOSTIC[i];
    await recordAttempt({ ex, result: o.result, answer: o.answer, durationMs: o.durationMs, mode: "diagnostic" });
    setOuts((x) => [...x, o]);
    if (i + 1 < DIAGNOSTIC.length) {
      setI(i + 1);
      window.scrollTo({ top: 0 });
    } else {
      const skills = await db.skills.toArray();
      const act = skills.filter((s) => ACTIVE_SKILLS.includes(s.id)).sort((a, b) => a.rating - b.rating);
      const traps = await db.mistakes.where("createdAt").above(startedAt).toArray();
      await saveAssessment({
        date: Date.now(),
        source: "diagnostic",
        results: act.map((s) => ({ skill: s.id, rating: s.rating, level: ratingToLevel(s.rating) })),
        weakPoints: [...act.slice(0, 3).map((s) => skillLabel(s.id)), ...traps.map((t) => `“${t.wrong}” → “${t.correct}”`)],
        strengths: act.slice(-3).reverse().map((s) => skillLabel(s.id)),
      });
      await updateSettings({ onboarded: true });
      setPhase("results");
    }
  }

  if (phase === "run") {
    const ex = DIAGNOSTIC[i];
    return (
      <div className="min-h-screen">
        <FocusBar current={i} outcomes={outs} total={DIAGNOSTIC.length} label="Diagnostic" exitHref="/assessment" />
        <div className="mx-auto max-w-2xl px-5 sm:px-6 pt-10 pb-24 md:pt-16">
          <ExercisePlayer key={ex.id} ex={ex} settings={settings} onDone={onDone} compact />
        </div>
      </div>
    );
  }

  if (phase === "results") return <Results latest={assessments[0]} />;

  return (
    <Page narrow>
      <PageHeader title={<>Measure, <em>don&apos;t guess.</em></>} kicker={`Diagnostic · ${DIAGNOSTIC.length} tasks · 15–20 min`} />
      <Card className="p-8">
        <p className="text-ink/90 text-[16px] leading-relaxed">
          {DIAGNOSTIC.length} short tasks, about 15–20 minutes. Each skill is probed at three levels (B2+, C1, C2), mixed together. Your self-assessment is not used: the app
          starts from a neutral prior and moves according to what you actually get right, weighted by difficulty.
        </p>
        <div className="flex flex-wrap gap-1.5 mt-5">
          {SKILLS.filter((s) => !s.requiresAudio).map((s) => (
            <Chip key={s.id}>{s.label}</Chip>
          ))}
        </div>
        <div className="mt-6 rounded-2xl border border-warn/25 bg-warn-soft text-[13.5px] p-4 flex gap-3 items-start leading-relaxed">
          <Icon name="mic" className="size-4 mt-0.5 text-warn shrink-0" />
          <span>
            <b>Listening and speaking are not assessed.</b> They need audio interaction. The skill model already has slots for them, so an audio module can be added later
            without changing the rest.
          </span>
        </div>
        <Button variant="primary" size="lg" className="mt-8" onClick={begin}>
          {assessments.some((a) => a.source === "diagnostic") ? "Retake the diagnostic" : "Start the diagnostic"} <Icon name="arrow" />
        </Button>
        {assessments.some((a) => a.source === "diagnostic") && (
          <p className="text-[12px] text-faint mt-2">Retaking resets the skill ratings and re-estimates them from this new run.</p>
        )}
      </Card>

      <ImportTest />

      {assessments.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-[34px] mb-5">History</h2>
          <div className="space-y-3">
            {assessments.map((a) => (
              <Card key={a.id} className="p-5">
                <div className="flex justify-between items-baseline">
                  <p className="font-medium text-[14px]">{a.source === "diagnostic" ? "Diagnostic" : "Imported test"}</p>
                  <span className="text-[12px] text-faint">{new Date(a.date).toLocaleDateString("en-GB")}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {a.results.map((r) => (
                    <Chip key={r.skill}>
                      {skillLabel(r.skill)}: {r.level}
                    </Chip>
                  ))}
                </div>
                {a.notes && <p className="text-[13px] text-muted mt-3">{a.notes}</p>}
              </Card>
            ))}
          </div>
        </section>
      )}
    </Page>
  );
}

function Results({ latest }: { latest?: import("@/lib/types").Assessment }) {
  const skillsLive = useLiveQuery(() => db.skills.toArray(), []) ?? [];
  if (!latest) return null;
  const sorted = [...latest.results].sort((a, b) => b.rating - a.rating);
  const overall = sorted.reduce((s, r) => s + r.rating, 0) / (sorted.length || 1);
  const traps = latest.weakPoints.filter((w) => w.startsWith("“"));
  return (
    <Page narrow>
      <PageHeader title={<>Your <em>profile</em></>} kicker="Diagnostic results" />
      <Card className="p-8">
        <div className="grid sm:grid-cols-[1fr_1.1fr] gap-8 items-center">
          <div>
            <span className="kicker">Overall estimate</span>
            <p className="font-display text-[120px] leading-[0.8] tracking-[-0.04em] mt-3">{ratingToLevel(overall)}</p>
          </div>
          <div className="px-6"><SkillRadar skills={skillsLive} /></div>
        </div>
        <p className="text-[12px] text-faint mt-2">Internal indicators calibrated on this app&apos;s exercises, not an official CEFR certification. They sharpen as you practise.</p>
        <div className="mt-6 space-y-2.5">
          {sorted.map((r) => (
            <div key={r.skill} className="flex items-center gap-3 text-[14px]">
              <span className="w-32 sm:w-48 shrink-0">{skillLabel(r.skill)}</span>
              <Bar value={r.rating / 100} className="flex-1" tone={r.rating >= 70 ? "good" : r.rating >= 58 ? "accent" : "warn"} />
              <span className="w-12 text-right font-medium">{r.level}</span>
            </div>
          ))}
          <div className="flex items-center gap-3 text-[14px] text-faint">
            <span className="w-32 sm:w-48 shrink-0 flex items-center gap-1.5">
              <Icon name="mic" className="size-3.5" /> Listening, Speaking
            </span>
            <span>not assessed (needs audio)</span>
          </div>
        </div>
      </Card>
      <div className="grid sm:grid-cols-2 gap-4 mt-4">
        <Card className="p-5">
          <p className="text-[13px] font-medium mb-2">Priority weak points</p>
          <ul className="text-[14px] space-y-1">
            {latest.weakPoints.filter((w) => !w.startsWith("“")).map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          {traps.length > 0 && (
            <>
              <p className="text-[13px] font-medium mt-4 mb-2">Traps you fell into</p>
              <ul className="text-[13px] space-y-1 text-muted">
                {traps.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </>
          )}
        </Card>
        <Card className="p-5">
          <p className="text-[13px] font-medium mb-2">Strengths</p>
          <ul className="text-[14px] space-y-1">
            {latest.strengths.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <p className="text-[13px] text-muted mt-4">Your daily sessions now lean towards your weak points, while still mixing in everything else.</p>
        </Card>
      </div>
      <div className="flex gap-2 mt-8">
        <LinkButton href="/session" variant="primary">
          Start your first session <Icon name="arrow" />
        </LinkButton>
        <LinkButton href="/">Dashboard</LinkButton>
      </div>
    </Page>
  );
}

function ImportTest() {
  const settings = useSettings();
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ai = getProvider(settings);
  const controller=useRef<AbortController|null>(null);
  useEffect(()=>()=>controller.current?.abort(),[]);

  async function analyse() {
    if (!ai||busy||!text.trim()) return;
    const abort=new AbortController();controller.current=abort;
    setBusy(true);
    setStatus(null);
    try {
      const r = await ai.analyzeTest(text,abort.signal);
      if(abort.signal.aborted)return;
      await applyTestAnalysis(r);
      setStatus(`Done: ${Object.keys(r.levels).length} skills estimated, ${r.mistakes.length} mistakes added to your list. ${r.summary}`);
      setText("");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-7 mt-4">
      <h2 className="font-display text-[24px]">Use a test you already took</h2>
      <p className="text-muted mt-2 text-[14px]">
        Paste the questions and your answers. They are treated as extra evidence (30% weight), never as the final word: the mistakes found go into your review queue.
      </p>
      <textarea disabled={busy} className="field mt-4 min-h-36 text-[14px]" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the test with your answers…" />
      <div className="flex items-center gap-3 mt-3">
        <Button variant="primary" disabled={!ai || !text.trim() || busy} onClick={analyse}>
          {busy ? "Analysing…" : "Analyse"}
        </Button>
        {!ai && <span className="text-[13px] text-muted">IA indisponible. <a href="/settings#ai" className="link">Configurer un modèle local ou distant</a>.</span>}
      </div>
      {busy&&<Button size="sm" onClick={()=>controller.current?.abort()}>Annuler l’analyse</Button>}
      {status && <p role="status" className="text-[13px] mt-3">{status}</p>}
      {ai&&<AIDiagnostics/>}
    </Card>
  );
}
