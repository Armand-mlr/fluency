"use client";

import Link from "next/link";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/schema";
import { LESSONS, LEARNING_PATHS, TRACKS } from "@/content/catalog/lessons";
import type { LessonTrack } from "@/content/catalog/types";
import { CATALOG_ITEMS, VOCABULARY_PACKS } from "@/content/catalog/vocabulary";
import { Bar, Button, Chip, Empty, LinkButton, Page, PageHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { cx } from "@/lib/util";

export default function LessonsPage() {
  const progress = useLiveQuery(() => db.lessonProgress.toArray(), []) ?? [];
  const byId = new Map(progress.map(p => [p.id, p]));
  const [query, setQuery] = useState("");
  const [track, setTrack] = useState<LessonTrack | "">("");
  const [level, setLevel] = useState("");
  const [status, setStatus] = useState("");
  const [path, setPath] = useState("");
  const selectedPath = LEARNING_PATHS.find(p => p.id === path);
  const queryKey = query.trim().toLocaleLowerCase("fr").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const filtered = LESSONS.filter(l => {
    const p = byId.get(l.id);
    const text = `${l.title} ${l.subtitle} ${l.sections.map(s => `${s.body} ${s.pattern}`).join(" ")}`.toLocaleLowerCase("fr").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return (!queryKey || text.includes(queryKey)) && (!track || l.track === track) && (!level || l.level === level)
      && (!selectedPath || (selectedPath.lessons as readonly string[]).includes(l.id))
      && (!status || (status === "new" ? !p?.readAt && !p?.completedAt : status === "read" ? p?.readAt && !p.completedAt : p?.completedAt));
  }).sort((a, b) => selectedPath ? (selectedPath.lessons as readonly string[]).indexOf(a.id) - (selectedPath.lessons as readonly string[]).indexOf(b.id) : 0);
  const completed = LESSONS.filter(l => byId.get(l.id)?.completedAt).length;
  const resume = LESSONS.find(l => byId.get(l.id)?.readAt && !byId.get(l.id)?.completedAt) ?? LESSONS.find(l => !byId.get(l.id)?.completedAt);
  const reset = () => { setQuery(""); setTrack(""); setLevel(""); setStatus(""); setPath(""); };

  return <Page>
    <PageHeader kicker="La bibliothèque · disponible sans IA" title={<>Comprendre.<br/><em className="text-accent">Puis s’en servir.</em></>} lede="Une règle claire, des exemples en contexte, puis quatre étapes pour passer de la reconnaissance à vos propres phrases.">
      <LinkButton href="/vocabulary"><Icon name="book"/> {CATALOG_ITEMS.length} mots & expressions</LinkButton>
    </PageHeader>
    <section className="card overflow-hidden mb-10 grid md:grid-cols-[1fr_260px]">
      <div className="p-7 sm:p-9">
        <p className="kicker text-accent!">Votre prochain pas</p>
        <h2 className="font-display text-[32px] mt-3 leading-tight">{resume?.title ?? "Revenir, pour mieux retenir."}</h2>
        <p className="text-muted mt-3 max-w-xl">{resume?.subtitle ?? "Vous avez parcouru toutes les leçons. Reprenez un point fragile ou retrouvez vos exercices dans Today."}</p>
        <div className="flex flex-wrap gap-3 mt-6">
          <LinkButton href={resume ? `/lessons/${resume.id}` : "/session?mode=review"} variant="primary">{resume && byId.get(resume.id)?.readAt ? "Reprendre la leçon" : resume ? "Ouvrir la leçon" : "Réviser"}<Icon name="arrow"/></LinkButton>
          <LinkButton href="/session" variant="ghost">Session Today</LinkButton>
        </div>
      </div>
      <div className="bg-surface-2 p-7 sm:p-9 border-t md:border-t-0 md:border-l border-line flex flex-col justify-center">
        <p className="font-display text-[68px] leading-none">{completed}<span className="text-[30px] text-faint">/{LESSONS.length}</span></p>
        <p className="text-muted text-sm mt-2 mb-4">leçons pratiquées jusqu’au bout</p>
        <Bar value={completed / LESSONS.length}/>
        <p className="text-xs text-faint mt-4">La lecture et la pratique sont suivies séparément. Vos exercices reviennent dans les révisions.</p>
      </div>
    </section>

    <div className="flex items-baseline justify-between gap-4 mb-4"><h2 className="font-display text-[29px]">Choisir un <em>parcours</em></h2><span className="text-xs text-faint">À votre rythme</span></div>
    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 mb-10">
      {LEARNING_PATHS.map((p, index) => {
        const done = p.lessons.filter(id => byId.get(id)?.completedAt).length;
        return <button key={p.id} aria-pressed={path === p.id} onClick={() => { setPath(path === p.id ? "" : p.id); setTrack(""); setLevel(""); setStatus(""); setQuery(""); }} className={cx("card card-hover p-6 text-left flex flex-col", path === p.id && "border-accent! bg-accent-soft!")}>
          <div className="flex justify-between text-xs text-faint"><span className="mono">0{index + 1}</span><span>{done}/{p.lessons.length} pratiquées</span></div>
          <h3 className="font-display text-[23px] leading-tight mt-3">{p.title}</h3>
          <p className="text-sm text-muted mt-2">{p.description}</p>
        </button>;
      })}
    </div>

    <section aria-label="Catalogue des leçons">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5"><h2 className="font-display text-[29px]">{selectedPath?.title ?? "Toutes les leçons"}</h2><span className="text-sm text-muted" aria-live="polite">{filtered.length} résultat{filtered.length > 1 ? "s" : ""}</span></div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_.65fr_1fr] gap-2 mb-4">
        <input className="field" aria-label="Rechercher une leçon" placeholder="Un point à éclaircir ? wish, raconter…" value={query} onChange={e => setQuery(e.target.value)}/>
        <select className="field" aria-label="Thème des leçons" value={track} onChange={e => setTrack(e.target.value as LessonTrack | "")}><option value="">Tous les thèmes</option>{Object.entries(TRACKS).map(([id, t]) => <option key={id} value={id}>{t.title}</option>)}</select>
        <select className="field" aria-label="Niveau des leçons" value={level} onChange={e => setLevel(e.target.value)}><option value="">Tous niveaux</option>{[...new Set(LESSONS.map(l => l.level))].sort().map(l => <option key={l}>{l}</option>)}</select>
        <select className="field" aria-label="Progression des leçons" value={status} onChange={e => setStatus(e.target.value)}><option value="">Toute progression</option><option value="new">À découvrir</option><option value="read">Lues, à pratiquer</option><option value="done">Pratiquées</option></select>
      </div>
      {(query || track || level || status || path) && <Button variant="ghost" size="sm" onClick={reset} className="mb-4">Réinitialiser les filtres</Button>}
      {!filtered.length ? <Empty title="Aucune leçon pour ces filtres">Essayez un autre thème ou effacez les filtres.</Empty> : <div className="grid sm:grid-cols-2 gap-4">
        {filtered.map(l => {
          const p = byId.get(l.id);
          return <Link key={l.id} href={`/lessons/${l.id}`} className="card card-hover group p-6 sm:p-7 flex flex-col">
            <div className="flex gap-2 flex-wrap items-center"><Chip tone="accent">{l.level}</Chip><span className="text-[11px] text-faint">{TRACKS[l.track].title}</span>{p?.completedAt ? <Chip tone="good">Pratiquée</Chip> : p?.readAt ? <Chip>Lue</Chip> : null}</div>
            <h3 className="font-display text-[28px] leading-tight mt-4 group-hover:text-accent transition-colors">{l.title}</h3>
            <p className="text-muted text-sm mt-2 flex-1">{l.subtitle}</p>
            <div className="mt-6 pt-4 border-t border-line flex items-center justify-between text-xs text-faint"><span>≈ {l.minutes} min · {l.exercises.length} exercices</span><Icon name="arrow" className="size-4 text-accent"/></div>
          </Link>;
        })}
      </div>}
    </section>
    <p className="text-xs text-faint leading-relaxed mt-7">Les niveaux sont des repères de travail, pas une certification. Les {VOCABULARY_PACKS.length} collections thématiques sont liées aux leçons. Pour retenir : essayez de restituer sans regarder, utilisez l’expression dans votre vie, puis revenez sur vos révisions.</p>
  </Page>;
}
