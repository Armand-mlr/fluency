import type { CEFR, Exercise, VocabItem, VocabList } from "@/lib/types";

export type CatalogItem = Omit<VocabItem, "source" | "createdAt">;
export interface VocabularyPack {
  version: number;
  id: string;
  title: string;
  description: string;
  color: string;
  items: CatalogItem[];
}
export type LessonTrack = "grammar" | "conversation" | "writing" | "precision";
export interface Lesson {
  id: string;
  title: string;
  subtitle: string;
  level: CEFR;
  track: LessonTrack;
  minutes: number;
  tags: string[];
  relatedListIds: string[];
  sections: {
    title: string;
    body: string;
    pattern: string;
    examples: { en: string; fr: string; note: string }[];
  }[];
  pitfalls: { wrong: string; right: string; why: string }[];
  takeaway: string;
  recallPrompt: string;
  exercises: Exercise[];
}
export interface StarterPack { version: number; lists: Omit<VocabList, "createdAt">[]; items: CatalogItem[] }
