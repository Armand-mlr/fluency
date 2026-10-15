"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ClozeExercise, Exercise, FreeExercise, GradeResult, McqExercise, Settings } from "@/lib/types";
import { grade, needsAIReview, SELF_OPTIONS, wordCount } from "@/lib/engine/grader";
import { getProvider } from "@/lib/ai/provider";
import { skillLabel } from "@/lib/engine/levels";
import { Button, Chip, Rich } from "./ui";
import { Icon } from "./Icon";
import { cx } from "@/lib/util";
import { AIDiagnostics } from "./AIDiagnostics";
import { AIReviewDetails } from "./AIReviewDetails";
import { AIExplanation } from "./AIExplanation";

export interface Outcome {
  result: GradeResult;
  answer: string;
  durationMs: number;
}

type Phase = "answer" | "grading" | "self" | "feedback";

const TYPE_LABEL: Record<Exercise["type"], string> = {
  mcq: "Choose",
  cloze: "Complete",
  rewrite: "Rewrite",
  translate: "Translate",
  "spot-error": "Find the error",
  correct: "Correct",
  free: "Write",
  explain: "Explain",
};

export function ExercisePlayer({
  ex,
  settings,
  reason,
  onDone,
  compact,
}: {
  ex: Exercise;
  settings: Settings;
  reason?: string;
  onDone: (o: Outcome) => void;
  compact?: boolean; // diagnostic: shorter feedback
}) {
  const start = useRef(0);
  const [phase, setPhase] = useState<Phase>("answer");
  const [text, setText] = useState(ex.type === "correct" ? ex.prompt : "");
  const [choice, setChoice] = useState<number | null>(null);
  const [hintUsed, setHintUsed] = useState(false);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [improved, setImproved] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [checks, setChecks] = useState<boolean[]>([]);
  const duration = useRef(0);
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const ai = useMemo(() => getProvider(settings), [settings]);
  const controller=useRef<AbortController|null>(null);
  const submitting=useRef(false);const mounted=useRef(false);

  useEffect(() => {
    mounted.current=true;
    start.current = Date.now(); // the timer starts when the exercise appears
    inputRef.current?.focus();
    return ()=>{mounted.current=false;controller.current?.abort();};
  }, []);

  const answerString = () =>
    ex.type === "mcq" ? (choice !== null ? ex.options[choice] : "") : ex.type === "spot-error" ? (choice === -1 ? "No error" : choice !== null ? ex.segments[choice] : "") : text;

  async function submit(value?: number) {
    if (phase !== "answer" || submitting.current) return;
    submitting.current=true;
    duration.current = Date.now() - start.current;
    const ans = value ?? text;
    if (typeof value === "number") setChoice(value);
    let r = grade(ex, ans);
    if (hintUsed && r.score > 0.7) r = { ...r, score: 0.7, feedback: (r.feedback ? r.feedback + " " : "") + "(Hint used.)" };

    if ((typeof ans==="string"&&needsAIReview(ex,ans,r)&&ai)||r.verdict === "self") {
      if (ai && typeof ans === "string" && ans.trim()) {
        setPhase("grading");
        const abort=new AbortController();controller.current=abort;
        try {
          let g = await ai.gradeProduction(ex, ans,abort.signal);
          if(!mounted.current)return;
          if(hintUsed&&g.score>0.7)g={...g,score:0.7,feedback:g.feedback+" (Indice utilisé.)"};
          setImproved(g.improved ?? null);
          setResult(g);
          setPhase("feedback");
          return;
        } catch (e) {
          if(!mounted.current)return;
          setAiError(e instanceof Error ? e.message : String(e));
        }
      }
      setResult({...r,verdict:"self"});
      setChecks(new Array((ex as FreeExercise).rubric?.length ?? 0).fill(false));
      setPhase("self");
      return;
    }
    setResult(r);
    setPhase("feedback");
  }

  function skip(){
    if(phase!=="answer"||submitting.current)return;
    submitting.current=true;duration.current=Date.now()-start.current;
    setText("");setChoice(null);setImproved(null);
    const local=grade(ex,"");
    setResult({...local,score:0,verdict:"wrong",skipped:true,ai:false,feedback:"Exercice passé. Voici une réponse modèle et son explication ; aucune réponse personnelle n’a été envoyée à l’IA."});setPhase("feedback");
  }

  async function retryReview(){
    if(!ai||!text.trim()||phase==="grading")return;
    const abort=new AbortController();controller.current=abort;setPhase("grading");setAiError(null);
    try{let g=await ai.gradeProduction(ex,text,abort.signal);if(!mounted.current)return;if(hintUsed&&g.score>0.7)g={...g,score:0.7,feedback:g.feedback+" (Indice utilisé.)"};setResult(g);setImproved(g.improved??null);setPhase("feedback");}
    catch(e){if(mounted.current){setAiError((e as Error).message);setPhase("self");}}
  }

  function selfAssess(score: number) {
    const verdict: GradeResult["verdict"] = score >= 0.9 ? "correct" : score >= 0.5 ? "close" : "wrong";
    setResult((r) => ({ ...(r as GradeResult), score, verdict }));
    setPhase("feedback");
  }

  const finished = useRef(false);
  function finish() {
    if (!result || finished.current) return;
    finished.current = true;
    onDone({ result, answer: answerString(), durationMs: duration.current });
  }

  // keyboard: 1-4 for choices, Enter to continue
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA";
      if (phase === "answer" && ex.type === "mcq" && !typing) {
        const n = Number(e.key);
        if (n >= 1 && n <= ex.options.length) submit(n - 1);
      }
      if (phase === "feedback" && e.key === "Enter" && !typing) {
        e.preventDefault();
        finish();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const isText = ["cloze", "rewrite", "translate", "correct", "free", "explain"].includes(ex.type);
  const long = ex.type === "free" || ex.type === "explain";
  const wc = wordCount(text);
  const promptText = "prompt" in ex ? ex.prompt : "";
  const bigPrompt = !long && promptText.length <= 150;
  const good = result && result.score >= 0.85;

  return (
    <div className="rise">
      {/* meta line */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <span className="mono text-[10.5px] uppercase tracking-[0.16em] text-accent">{TYPE_LABEL[ex.type]}</span>
        <span className="text-faint">/</span>
        {ex.skills.slice(0, 2).map((s) => (
          <Chip key={s}>{skillLabel(s)}</Chip>
        ))}
        {reason && <span className="mono text-[10.5px] text-faint ml-auto">{reason}</span>}
      </div>

      <p className="text-[15px] text-muted mb-4">{ex.instruction}</p>

      {/* prompt */}
      {promptText && ex.type !== "cloze" && (
        <Rich
          text={promptText}
          className={cx(
            "mb-8",
            bigPrompt ? "font-display text-[30px] sm:text-[38px] leading-[1.15] tracking-[-0.02em]" : "text-[17px] leading-relaxed text-ink/90 border-l-2 border-accent pl-5",
          )}
        />
      )}

      {/* cloze: the blank lives inside the sentence */}
      {ex.type === "cloze" && <ClozePrompt ex={ex} value={text} phase={phase} result={result} />}

      {/* ---------- answer area ---------- */}
      {ex.type === "mcq" && <McqOptions ex={ex} phase={phase} choice={choice} onPick={(i) => submit(i)} />}

      {ex.type === "spot-error" && (
        <div>
          <div className="font-display text-[30px] sm:text-[36px] leading-[1.5] mb-6 tracking-[-0.015em]">
            {ex.segments.map((seg, i) => {
              const picked = choice === i;
              const isWrong = phase === "feedback" && i === ex.wrongIndex;
              return (
                <button
                  key={i}
                  disabled={phase !== "answer"}
                  onClick={() => submit(i)}
                  className={cx(
                    "rounded-md px-0.5 transition-all duration-200",
                    phase === "answer" && "cursor-pointer underline decoration-line-strong decoration-1 underline-offset-[10px] hover:decoration-accent hover:text-accent",
                    isWrong && "bg-bad-soft text-bad line-through decoration-2 shake",
                    picked && !isWrong && phase === "feedback" && "bg-warn-soft",
                  )}
                >
                  {seg}
                </button>
              );
            })}
          </div>
          {phase === "answer" && (
            <Button variant="secondary" size="sm" onClick={() => submit(-1)}>
              No error here
            </Button>
          )}
        </div>
      )}

      {isText && phase === "answer" && (
        <div>
          {ex.type === "cloze" ? (
            <input
              ref={inputRef}
              className="w-full bg-transparent border-0 border-b-2 border-line-strong focus:border-accent outline-none font-display text-[30px] py-2 placeholder:text-faint/60 transition-colors"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && text.trim()) {
                  e.preventDefault(); // otherwise the same keypress "clicks" Continue and skips the feedback
                  submit();
                }
              }}
              placeholder="type the missing words"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
            />
          ) : (
            <textarea
              ref={inputRef}
              className={cx("field text-[17px] leading-relaxed resize-y !p-5 !rounded-2xl", long ? "min-h-52" : "min-h-28")}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && text.trim()) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder={ex.type === "correct" ? "" : "Write your answer…"}
              spellCheck={false}
            />
          )}
          <div className="flex flex-wrap items-center justify-between mt-4 gap-3">
            <div className="text-[12px] text-faint mono">
              {long ? (
                <span>
                  <span className={cx("num", "minWords" in ex && ex.minWords && wc >= ex.minWords ? "text-good" : "")}>{wc}</span> words
                  {"minWords" in ex && ex.minWords ? ` · aim ${ex.minWords}${ex.maxWords ? `–${ex.maxWords}` : "+"}` : ""}
                </span>
              ) : ex.type === "cloze" ? (
                <span className="flex items-center gap-1.5"><kbd className="kbd">↵</kbd> to check</span>
              ) : (
                <span className="flex items-center gap-1.5"><kbd className="kbd">⌘</kbd><kbd className="kbd">↵</kbd> to check</span>
              )}
            </div>
            <div className="flex gap-2">
              {"hint" in ex && ex.hint && !hintUsed && (
                <Button variant="ghost" size="sm" onClick={() => setHintUsed(true)}>
                  Hint
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={skip}>
                I don&apos;t know
              </Button>
              <Button variant="primary" onClick={() => submit()} disabled={!text.trim()}>
                Check
              </Button>
            </div>
          </div>
          {hintUsed && "hint" in ex && (
            <p className="text-[13.5px] text-warn mt-3 rise flex gap-2">
              <span className="mono text-[10.5px] uppercase tracking-wider mt-0.5">Hint</span> {ex.hint}
            </p>
          )}
        </div>
      )}

      {isText && ex.type !== "cloze" && phase !== "answer" && (
        <div className={cx("rounded-2xl border px-5 py-4 text-[16px] whitespace-pre-wrap", good ? "border-good/30 bg-good-soft" : "border-line bg-surface-2")}>
          <span className="kicker !text-[9.5px] block mb-1.5">Your answer</span>
          {text || <span className="text-faint italic">(no answer)</span>}
        </div>
      )}

      {phase === "grading" && (
        <div className="mt-6 flex items-center gap-3 text-muted text-[14px]">
          <span className="size-2 rounded-full bg-accent pulse-dot" /> Reading your answer closely… <Button size="sm" variant="ghost" onClick={()=>controller.current?.abort()}>Annuler la correction</Button>
        </div>
      )}

      {/* ---------- self assessment ---------- */}
      {phase === "self" && result && (
        <div className="mt-6 rise">
          {(!ai || aiError) && <div role="status" className="text-[12px] text-warn mb-3">{aiError || "Correction IA non configurée."} Autoévaluation disponible ci-dessous. <Link className="link" href="/settings#ai">Réglages IA</Link>{aiError && <Button size="sm" variant="ghost" onClick={retryReview}>Réessayer la correction IA</Button>}</div>}
          {result.feedback && <p className="text-[14.5px] text-muted mb-4">{result.feedback}</p>}
          <div className="rounded-2xl border border-accent/30 bg-accent-soft p-5">
            <span className="kicker !text-[9.5px] !text-accent block mb-2">Model answer</span>
            <p className="font-display text-[20px] leading-snug whitespace-pre-wrap">{result.expected}</p>
          </div>
          {"rubric" in ex && ex.rubric?.length ? (
            <div className="mt-6">
              <p className="text-[14px] font-semibold mb-3">Be honest. What did your answer actually do?</p>
              <div className="flex flex-col gap-2">
                {ex.rubric.map((r, i) => (
                  <label
                    key={i}
                    className={cx(
                      "flex items-start gap-3 text-[14.5px] cursor-pointer rounded-xl border px-4 py-3 transition-colors",
                      checks[i] ? "border-accent/40 bg-accent-soft" : "border-line hover:border-line-strong",
                    )}
                  >
                    <input type="checkbox" className="mt-1 accent-[var(--accent)] size-4" checked={checks[i] ?? false} onChange={(e) => setChecks((c) => c.map((v, j) => (j === i ? e.target.checked : v)))} />
                    {r}
                  </label>
                ))}
              </div>
              <Button variant="primary" className="mt-5" onClick={() => selfAssess(checks.filter(Boolean).length / ex.rubric.length)}>
                Validate
              </Button>
            </div>
          ) : (
            <div className="mt-6">
              <p className="text-[14px] font-semibold mb-3">Compared with the model, yours was…</p>
              <div className="flex flex-wrap gap-2">
                {SELF_OPTIONS.map((o) => (
                  <Button key={o.label} onClick={() => selfAssess(o.score)}>
                    {o.label}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---------- feedback ---------- */}
      {phase === "feedback" && result && (
        <Feedback ex={ex} result={result} choice={choice} improved={improved} compact={compact} onNext={finish}>
          <AIReviewDetails result={result}/>
          {!result.ai&&<AIExplanation ai={ai} ex={ex} answer={answerString()} result={result} automatic={!compact&&!result.skipped&&result.score<0.85}/>}
        </Feedback>
      )}
      {(ai||aiError)&&<AIDiagnostics/>}
    </div>
  );
}

/** The sentence with its blank drawn inline; after checking, the blank shows the answer. */
function ClozePrompt({ ex, value, phase, result }: { ex: ClozeExercise; value: string; phase: Phase; result: GradeResult | null }) {
  const lines = ex.prompt.split("\n");
  const idx = Math.max(0, lines.findIndex((l) => l.includes("___")));
  const pre = lines.slice(0, idx).filter((l) => l.trim());
  const post = lines.slice(idx + 1).join("\n").trim();
  const [before, after = ""] = lines[idx].split("___");
  const done = phase === "feedback" && result;
  const ok = done && result!.score >= 0.85;
  const long = lines[idx].length > 150;
  return (
    <div className="mb-8">
      {pre.length > 0 && (
        <div className="border-l-2 border-accent pl-5 mb-6 space-y-1">
          {pre.map((l) => (
            <p key={l} className="text-[17px] leading-relaxed">{l}</p>
          ))}
        </div>
      )}
      <p className={cx("font-display tracking-[-0.02em]", long ? "text-[22px] leading-snug" : "text-[30px] sm:text-[38px] leading-[1.2]")}>
        {before}
        <span
          className={cx(
            "inline-block min-w-[3.5em] mx-1 px-2 border-b-2 text-center transition-colors italic-display",
            !done && "border-accent text-accent",
            ok && "border-good text-good pop",
            done && !ok && "border-bad text-bad shake",
          )}
        >
          {done ? (ok ? value || result!.expected : value || "?") : value || "\u00a0"}
        </span>
        {after}
      </p>
      {done && !ok && (
        <p className="mt-4 rise flex items-baseline gap-3">
          <span className="kicker !text-[9.5px]">Answer</span>
          <span className="font-display italic-display text-[24px] text-good">{result!.expected}</span>
        </p>
      )}
      {post && <p className="text-[14.5px] text-muted mt-4 whitespace-pre-wrap">{post}</p>}
    </div>
  );
}

function McqOptions({ ex, phase, choice, onPick }: { ex: McqExercise; phase: Phase; choice: number | null; onPick: (i: number) => void }) {
  return (
    <div className="grid gap-2.5">
      {ex.options.map((o, i) => {
        const done = phase === "feedback";
        const right = done && i === ex.answer;
        const wrong = done && i === choice && i !== ex.answer;
        return (
          <button
            key={i}
            disabled={phase !== "answer"}
            onClick={() => onPick(i)}
            style={{ animationDelay: `${0.05 + i * 0.05}s` }}
            className={cx(
              "rise group text-left rounded-2xl border px-4 py-3.5 text-[15.5px] transition-all duration-200 flex items-center gap-4",
              !done && "border-line bg-surface hover:border-accent/60 hover:bg-surface-2 hover:translate-x-1 cursor-pointer",
              right && "border-good/60 bg-good-soft pop",
              wrong && "border-bad/60 bg-bad-soft shake",
              done && !right && !wrong && "border-line opacity-40",
            )}
          >
            <span
              className={cx(
                "grid place-items-center size-7 shrink-0 rounded-lg mono text-[11px] border transition-colors",
                right ? "bg-good text-bg border-good" : wrong ? "bg-bad text-bg border-bad" : "border-line-strong text-muted group-hover:border-accent group-hover:text-accent",
              )}
            >
              {right ? "✓" : wrong ? "✕" : i + 1}
            </span>
            <span className="flex-1 leading-snug">{o}</span>
          </button>
        );
      })}
    </div>
  );
}

function Feedback({
  ex,
  result,
  choice,
  improved,
  compact,
  onNext,
  children,
}: {
  ex: Exercise;
  result: GradeResult;
  choice: number | null;
  improved: string | null;
  compact?: boolean;
  onNext: () => void;
  children?:React.ReactNode;
}) {
  const good = result.score >= 0.85;
  const mid = !good && result.score >= 0.5;
  const title = result.skipped?"Exercice passé.":good ? (result.typo ? "Nearly perfect." : "Correct.") : mid ? "Partly there." : "Not quite.";
  const optionNote = ex.type === "mcq" && choice !== null && choice !== ex.answer ? ex.optionNotes?.[choice] : undefined;
  const showExpected = ex.type !== "cloze" && (!good || ex.type === "rewrite" || ex.type === "translate" || ex.type === "free" || ex.type === "explain");
  const tone = good ? "good" : mid ? "warn" : "bad";
  const rule = { good: "before:bg-good", warn: "before:bg-warn", bad: "before:bg-bad" }[tone];

  return (
    <div className={cx("relative mt-8 rounded-2xl border border-line bg-surface p-6 pl-8 rise overflow-hidden before:absolute before:left-0 before:inset-y-0 before:w-[4px]", rule)}>
      <div className="flex items-center gap-3">
        <h3 className={cx("font-display italic-display text-[30px] leading-none", good ? "text-good" : mid ? "text-warn" : "text-bad")}>{title}</h3>
        {result.ai && <Chip tone="accent">AI feedback</Chip>}
      </div>

      {result.feedback && <p className="text-[14.5px] mt-3 leading-relaxed whitespace-pre-wrap">{result.feedback}</p>}

      <div className="mt-5 grid gap-5">
        {showExpected && result.expected && ex.type !== "mcq" && (
          <Block label={good ? "Model answer" : "Correct"}>
            <p className="font-display text-[21px] leading-snug whitespace-pre-wrap">{result.expected}</p>
          </Block>
        )}
        {improved && (
          <Block label="Your answer, improved">
            <p className="text-[15.5px] whitespace-pre-wrap">{improved}</p>
          </Block>
        )}
        {optionNote && <p className="text-[14px] text-muted">{optionNote}</p>}
        {(!compact||!good) && ex.explanation && (
          <Block label="Why">
            <p className="text-[15px] leading-relaxed text-ink/90 whitespace-pre-wrap">{ex.explanation}</p>
          </Block>
        )}
        {(!compact||!good) && ex.compare && ex.compare.length > 0 && (
          <Block label="Compare">
            <ul className="space-y-1">
              {ex.compare.map((c) => (
                <li key={c} className="font-display italic-display text-[18px] text-muted">
                  {c}
                </li>
              ))}
            </ul>
          </Block>
        )}
      </div>
      {children}
      <div className="mt-7 flex items-center justify-between">
        <span className="text-[12px] text-faint hidden sm:flex items-center gap-1.5 mono">
          <kbd className="kbd">↵</kbd> continue
        </span>
        <Button variant="primary" onClick={onNext} autoFocus>
          Continue <Icon name="arrow" className="size-4 transition-transform group-hover/btn:translate-x-1" />
        </Button>
      </div>
    </div>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="kicker !text-[9.5px] block mb-1.5">{label}</span>
      {children}
    </div>
  );
}
