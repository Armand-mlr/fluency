import grammar from "./lessons/grammar.json";
import conversation from "./lessons/conversation.json";
import writing from "./lessons/writing.json";
import precision from "./lessons/precision.json";
import type { Lesson, LessonTrack } from "./types";

export const LESSONS = [...grammar, ...conversation, ...writing, ...precision] as Lesson[];
export const LESSON_EXERCISES = LESSONS.flatMap(l => l.exercises);
export const lessonById = (id: string) => LESSONS.find(l => l.id === id);
export const TRACKS: Record<LessonTrack, { title: string; description: string }> = {
  grammar: { title: "Construire ses phrases", description: "Temps, hypothèses, verbes et constructions." },
  conversation: { title: "Interagir naturellement", description: "Questions, demandes et intentions claires." },
  writing: { title: "Raconter & argumenter", description: "Des idées reliées et des textes qui se tiennent." },
  precision: { title: "Gagner en précision", description: "Nuances, comparaisons et mots qui vont ensemble." },
};

export const LEARNING_PATHS = [
  { id: "stories", title: "Raconter sa vie", description: "Du repère temporel à l’anecdote complète.", lessons: ["narrative-tenses", "present-perfect", "past-habits", "future-in-past", "participle-clauses", "storytelling"] },
  { id: "choices", title: "Exprimer ce qui aurait pu être", description: "Hypothèses, regrets, déductions et préférences.", lessons: ["mixed-conditionals", "wish-if-only", "modal-deductions", "rather-time", "conditional-links", "hedging"] },
  { id: "natural", title: "Échanger avec justesse", description: "Passer de l’idée à une formulation naturelle.", lessons: ["verb-patterns", "prepositions-ing", "phrasal-order", "indirect-questions", "polite-requests", "emphatic-do", "collocation-precision"] },
  { id: "clear", title: "Écrire avec clarté", description: "Structurer, mettre en relief et défendre une idée.", lessons: ["relative-clauses", "concession", "parallel-structure", "cohesion", "cleft-sentences", "negative-inversion", "argument-paragraph"] },
  { id: "control", title: "Affiner ses constructions", description: "Réviser les distinctions qui changent le sens.", lessons: ["countability", "articles", "causatives", "reporting-passive", "reported-speech", "comparative-nuance"] },
] as const;
