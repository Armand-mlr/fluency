"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/schema";
import { LESSONS } from "@/content/catalog/lessons";
import { CATALOG_ITEMS, VOCABULARY_PACKS } from "@/content/catalog/vocabulary";
import { Icon } from "./Icon";
import { LinkButton } from "./ui";

export function LearningLibraryCard() {
  const progress = useLiveQuery(() => db.lessonProgress.toArray(), []) ?? [];
  const next = LESSONS.find(l => progress.some(p => p.id === l.id && p.readAt && !p.completedAt))
    ?? LESSONS.find(l => !progress.some(p => p.id === l.id && p.completedAt));
  return <section className="card mt-6 p-6 sm:p-8 grid lg:grid-cols-[1fr_auto] items-center gap-6">
    <div>
      <p className="kicker text-accent!">Votre bibliothèque · sans IA</p>
      <h2 className="font-display text-[29px] leading-tight mt-3">{LESSONS.length} leçons. <em>{CATALOG_ITEMS.length} façons de mieux dire.</em></h2>
      <p className="text-sm text-muted mt-3">{VOCABULARY_PACKS.length} collections thématiques, des parcours guidés et des exercices expliqués.{next ? ` À explorer : ${next.title.toLocaleLowerCase("fr")}.` : " Retrouvez les points déjà étudiés dans vos révisions."}</p>
    </div>
    <div className="flex flex-wrap lg:flex-col gap-2"><LinkButton href="/lessons" variant="primary">Explorer les leçons<Icon name="arrow"/></LinkButton><LinkButton href="/vocabulary" variant="ghost">Parcourir le vocabulaire</LinkButton></div>
  </section>;
}
