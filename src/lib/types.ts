// Central domain types. Everything the app stores or manipulates is described here.

// ---------- Levels & skills ----------

export type CEFR = "B1" | "B1+" | "B2" | "B2+" | "C1" | "C1+" | "C2";

export type SkillId =
  | "grammar"
  | "vocabulary"
  | "collocations"
  | "reading"
  | "writing"
  | "idioms"
  | "register"
  | "precision"
  | "structure"
  | "paraphrase"
  | "nuance"
  | "listening"
  | "speaking";

export type Register = "casual" | "neutral" | "professional" | "formal" | "academic" | "literary";

// ---------- Vocabulary ----------

export type ItemKind =
  | "word"
  | "expression"
  | "collocation"
  | "phrasal-verb"
  | "idiom"
  | "sentence"
  | "structure";

export interface VocabItem {
  id: string;
  kind: ItemKind;
  text: string; // "to come across"
  meaning: string; // "to encounter; to give a particular impression"
  translationFr?: string; // "tomber sur ; donner l'impression d'être"
  exampleFr?: string;
  example?: string; // "He came across as extremely confident."
  register: Register;
  level: CEFR | ""; // empty when an imported level is unknown
  tags: string[];
  listIds: string[];
  notes?: string;
  source: "seed" | "user" | "ai";
  createdAt: number;
}

export interface VocabList {
  id: string;
  name: string;
  description?: string;
  color: string; // tailwind-free hex, used for the dot
  createdAt: number;
  system?: boolean; // created by the app (can still be renamed)
}

// ---------- Mistakes ----------

export type MistakeType =
  | "grammar"
  | "vocabulary"
  | "collocation"
  | "register"
  | "word-order"
  | "preposition"
  | "tense"
  | "spelling"
  | "false-friend"
  | "style";

export type MistakeCause =
  | "french-interference"
  | "false-friend"
  | "overgeneralisation"
  | "register-mismatch"
  | "unnatural-phrasing"
  | "carelessness"
  | "unknown";

export interface Mistake {
  id: string;
  wrong: string;
  correct: string;
  type: MistakeType;
  cause: MistakeCause;
  explanation: string;
  frenchHint?: string; // the French sentence behind it, when relevant
  count: number; // how many times it happened
  lastSeen: number;
  createdAt: number;
  source: "seed" | "user" | "diagnostic" | "practice";
  resolved?: boolean;
}

// ---------- Memory (spaced repetition) ----------

export type CardRef = "item" | "mistake" | "exercise";
/**
 * A facet is one "way of knowing" something.
 * recognize: understand it when you see it
 * produce:   retrieve it from a French cue / definition
 * use:       use it correctly in context (register, collocation)
 * fix:       (mistakes) produce the correct version
 * solve:     (bank exercises) solve that exact exercise again
 */
export type Facet = "recognize" | "produce" | "use" | "fix" | "solve";
export type CardState = "new" | "learning" | "familiar" | "mastered";

export interface Card {
  id: string; // `${refType}:${refId}:${facet}`
  refType: CardRef;
  refId: string;
  facet: Facet;
  state: CardState;
  ease: number; // 1.3 .. 3.0
  interval: number; // days (fractional during learning steps)
  due: number; // timestamp
  reps: number; // successful reviews in a row
  successes: number;
  failures: number;
  lapses: number; // times it fell back after being learned
  difficulty: number; // 0..1 (running estimate, 1 = very hard for you)
  firstSeen?: number;
  lastReview?: number;
  createdAt: number;
  leech?: boolean;
  suspended?: boolean;
}

// ---------- Exercises ----------

export type ExerciseType =
  | "mcq"
  | "cloze"
  | "rewrite" // transform / paraphrase / register shift
  | "translate"
  | "spot-error"
  | "correct"
  | "free" // open production, self or AI graded
  | "explain"; // explain a nuance (free, with model answer)

export interface ExerciseBase {
  id: string;
  type: ExerciseType;
  skills: SkillId[];
  difficulty: number; // on the 0..100 skill scale (B2≈52, C1≈67, C2≈85)
  tags: string[];
  context?: string; // "work", "university", "news"...
  instruction: string;
  explanation?: string; // the WHY, shown after answering
  compare?: string[]; // optional contrasting examples
  // links back to the knowledge base, so results update the right cards
  itemId?: string;
  mistakeId?: string;
  facet?: Facet;
  origin?: "bank" | "generated" | "diagnostic" | "ai";
  estSeconds?: number;
  // a typical error this exercise targets: if you fall into it, it is logged
  // in "My recurring mistakes" and scheduled for review
  trap?: {
    key: string;
    wrong: string;
    correct: string;
    type: MistakeType;
    cause: MistakeCause;
    explanation: string;
    frenchHint?: string;
  };
}

export interface McqExercise extends ExerciseBase {
  type: "mcq";
  prompt: string;
  options: string[];
  answer: number; // index
  optionNotes?: string[]; // why each wrong option is wrong
}

export interface ClozeExercise extends ExerciseBase {
  type: "cloze";
  prompt: string; // contains ___ for the blank
  answers: string[]; // accepted
  hint?: string;
}

export interface RewriteExercise extends ExerciseBase {
  type: "rewrite" | "translate" | "correct";
  prompt: string;
  answers: string[]; // accepted full answers (normalised comparison)
  mustInclude?: string[][]; // each inner array = alternatives; every group must match (regex source)
  mustAvoid?: string[]; // regex sources that indicate the target was missed
  model: string; // best model answer
  hint?: string;
}

export interface SpotErrorExercise extends ExerciseBase {
  type: "spot-error";
  segments: string[]; // sentence split into clickable chunks
  wrongIndex: number; // -1 = no error
  correction: string; // corrected chunk
}

export interface FreeExercise extends ExerciseBase {
  type: "free" | "explain";
  prompt: string;
  model: string;
  rubric: string[]; // what a good answer does
  minWords?: number;
  maxWords?: number;
}

export type Exercise =
  | McqExercise
  | ClozeExercise
  | RewriteExercise
  | SpotErrorExercise
  | FreeExercise;

// ---------- Results ----------

export interface GradeResult {
  score: number; // 0..1
  verdict: "correct" | "close" | "partial" | "wrong" | "self";
  feedback?: string; // short, specific
  expected?: string;
  typo?: boolean;
  ai?: boolean;
  skipped?: boolean;
  improved?: string;
  corrections?: { original:string; corrected:string; explanation:string; example:string }[];
  strengths?: string[];
  nextStep?: string;
}

export interface Attempt {
  id: string;
  exerciseId: string;
  exerciseType: ExerciseType;
  skills: SkillId[];
  tags: string[];
  difficulty: number;
  score: number;
  answer: string;
  durationMs: number;
  createdAt: number;
  sessionId?: string;
  mode: "session" | "challenge" | "diagnostic" | "practice" | "writing" | "nuance";
  itemId?: string;
  mistakeId?: string;
}

export interface SkillState {
  id: SkillId;
  rating: number; // 0..100 internal scale
  attempts: number;
  updatedAt: number;
  history: { t: number; r: number }[];
}

export interface Session {
  id: string;
  startedAt: number;
  endedAt?: number;
  mode: "daily" | "challenge" | "review";
  planned: number;
  done: number;
  correct: number;
  durationMs: number;
}

export interface Assessment {
  id: string;
  date: number;
  source: "diagnostic" | "import";
  results: { skill: SkillId; rating: number; level: CEFR }[];
  weakPoints: string[];
  strengths: string[];
  notes?: string;
}

export interface Settings {
  id: "settings";
  sessionMinutes: number;
  newItemsPerDay: number;
  aiProvider: "none" | "anthropic" | "ollama" | "openai";
  aiKey?: string;
  aiModel?: string;
  onboarded: boolean;
  dailyGoal: number; // exercises per day
  name?: string;
  currentLevel?: CEFR;
  targetLevel?: CEFR;
  goals?: string;
  interests?: string;
}

export interface StudyUnit { id: string; title: string; explanation: string; exercises: Exercise[]; createdAt: number }

export interface LessonProgress {
  id: string;
  readAt?: number;
  completedAt?: number;
  bestScore?: number;
  lastScore?: number;
  completions: number;
}

export interface ContentState {
  id: "catalog";
  version: string;
  seenItemIds: string[];
  seenListIds: string[];
}
