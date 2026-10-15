"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/schema";
import { completeLesson, markLessonRead } from "@/lib/db/repo";
import { LEARNING_PATHS, lessonById, TRACKS } from "@/content/catalog/lessons";
import { VOCABULARY_PACKS } from "@/content/catalog/vocabulary";
import type { Lesson } from "@/content/catalog/types";
import { SessionRunner } from "./SessionRunner";
import { Button, Card, Chip, Page, PageHeader } from "./ui";
import { Icon } from "./Icon";

export function LessonView({ lesson }: { lesson: Lesson }) {
  const progress = useLiveQuery(() => db.lessonProgress.get(lesson.id), [lesson.id]);
  const [practice, setPractice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showRecall, setShowRecall] = useState(false);
  const path = LEARNING_PATHS.find(p => (p.lessons as readonly string[]).includes(lesson.id));
  const index = path ? (path.lessons as readonly string[]).indexOf(lesson.id) : -1;
  const nextId = path?.lessons[index + 1];
  const next = nextId ? lessonById(nextId) : undefined;

  async function read(startPractice: boolean) {
    setBusy(true); setError("");
    try { await markLessonRead(lesson.id); if (startPractice) { setPractice(true); window.scrollTo({ top: 0 }); } }
    catch { setError("La progression n’a pas pu être enregistrée. Réessayez."); }
    finally { setBusy(false); }
  }

  if (practice) return <>
    {error && <p role="alert" className="text-bad text-sm p-5">{error}</p>}
    <SessionRunner plan={lesson.exercises.map(ex => ({ ex, block: ex.type === "free" ? "production" : "practice", reason: lesson.title }))}
      mode="practice" exitHref={`/lessons/${lesson.id}`} finishHref={next ? `/lessons/${next.id}` : "/lessons"} finishLabel={next ? "Leçon suivante" : "Toutes les leçons"}
      onFinish={async outcomes => {
        try { await completeLesson(lesson.id, outcomes.reduce((sum, o) => sum + o.result.score, 0) / outcomes.length); }
        catch { setError("Les réponses ont été conservées, mais la fin de la leçon n’a pas pu être enregistrée."); }
      }}/>
  </>;

  return <Page>
    <Link href="/lessons" className="inline-flex items-center gap-2 text-sm text-muted hover:text-accent mb-7"><Icon name="back"/>Toutes les leçons</Link>
    <PageHeader kicker={`${TRACKS[lesson.track].title} · ${lesson.level} · ≈ ${lesson.minutes} min`} title={lesson.title} lede={lesson.subtitle}>
      {progress?.completedAt && <Chip tone="good">Pratiquée · meilleur résultat {Math.round((progress.bestScore ?? 0) * 100)} %</Chip>}
      <Button variant="primary" disabled={busy} onClick={() => read(true)}>Passer aux exercices<Icon name="arrow"/></Button>
    </PageHeader>
    <div className="grid lg:grid-cols-[minmax(0,1fr)_260px] gap-6 lg:gap-9 items-start">
      <article className="min-w-0 space-y-6">
        {lesson.sections.map((section, i) => <Card key={i} className="p-6 sm:p-8">
          <p className="kicker text-accent!">01 · Comprendre</p>
          <h2 className="font-display text-[29px] mt-4">{section.title}</h2>
          <p className="text-[16px] leading-[1.85] mt-4">{section.body}</p>
          <div className="bg-surface-2 rounded-xl p-5 mt-6 border border-line"><p className="kicker mb-3">La construction</p><p className="mono text-[13px] leading-relaxed break-words">{section.pattern}</p></div>
          <div className="space-y-6 mt-7">{section.examples.map((ex, j) => <div key={j} className="border-l-2 border-accent/40 pl-5">
            <p lang="en" className="font-display text-[25px] leading-snug">{ex.en}</p><p className="text-sm text-muted mt-2">{ex.fr}</p><p className="text-sm mt-3 leading-relaxed">{ex.note}</p>
          </div>)}</div>
        </Card>)}
        <Card className="p-6 sm:p-8">
          <p className="kicker">02 · Repérer le piège</p>
          {lesson.pitfalls.map((trap, i) => <div key={i} className="mt-5 space-y-3">
            <p className="text-bad text-[16px]"><span className="text-xs uppercase tracking-wide mr-2">À corriger</span><span lang="en">{trap.wrong}</span></p>
            <p className="text-good text-[17px]"><span className="text-xs uppercase tracking-wide mr-2">Formulation juste</span><span lang="en">{trap.right}</span></p>
            <p className="text-muted leading-relaxed text-sm">{trap.why}</p>
          </div>)}
        </Card>
        <Card className="p-6 sm:p-8">
          <p className="kicker">03 · Retrouver sans regarder</p>
          <h2 className="font-display text-[27px] leading-tight mt-4">{lesson.recallPrompt}</h2>
          <p className="text-muted text-sm mt-3">Formulez votre réponse à voix haute avant d’afficher le repère.</p>
          <Button className="mt-5" aria-expanded={showRecall} onClick={() => setShowRecall(v => !v)}>{showRecall ? "Masquer le repère" : "Afficher le repère"}</Button>
          {showRecall && <p className="mt-5 leading-relaxed bg-accent-soft rounded-xl p-5">{lesson.takeaway}</p>}
        </Card>
        <Card className="p-6 sm:p-8 bg-surface-2!">
          <p className="kicker text-accent!">04 · Passer à la pratique</p>
          <h2 className="font-display text-[29px] mt-4">Choisir. Compléter. Reformuler. Produire.</h2>
          <p className="text-sm text-muted leading-relaxed mt-3">Les réponses attendues sont corrigées localement. Pour une formulation libre, comparez au modèle et à la grille d’autoévaluation ; votre IA peut aussi vous aider lorsqu’elle est configurée.</p>
          <div className="flex gap-3 flex-wrap mt-6"><Button variant="primary" disabled={busy} onClick={() => read(true)}>Commencer les {lesson.exercises.length} exercices<Icon name="arrow"/></Button><Button disabled={busy || Boolean(progress?.readAt)} onClick={() => read(false)}>{progress?.readAt ? "Lecture enregistrée" : "Marquer comme lue"}</Button></div>
          {error && <p role="alert" className="text-bad text-sm mt-3">{error}</p>}
        </Card>
      </article>
      <aside className="lg:sticky lg:top-8 space-y-4">
        <Card className="p-6"><p className="kicker">Votre méthode</p><p className="font-display text-[23px] leading-snug mt-4">Un exemple compris.<br/>Une phrase à vous.</p><p className="text-sm text-muted mt-5 leading-relaxed">Repérez ce que la construction change dans le sens. Puis essayez de l’utiliser sans regarder le modèle. Revenez sur vos erreurs dans Today.</p></Card>
        <Card className="p-6"><p className="kicker">Les mots pour s’en servir</p><div className="space-y-3 mt-4">{lesson.relatedListIds.map(id => {
          const pack = VOCABULARY_PACKS.find(p => `pack-${p.id}` === id);
          return pack && <Link key={id} href={`/vocabulary?list=${id}`} className="flex items-center justify-between gap-2 text-sm hover:text-accent"><span>{pack.title}</span><Icon name="arrow" className="size-3 shrink-0"/></Link>;
        })}</div></Card>
        {path && <Card className="p-6"><p className="kicker">{path.title}</p><p className="text-sm text-muted mt-3">Étape {index + 1} sur {path.lessons.length}</p>{next && <Link href={`/lessons/${next.id}`} className="block text-sm text-accent mt-4">Ensuite : {next.title} →</Link>}</Card>}
      </aside>
    </div>
  </Page>;
}
