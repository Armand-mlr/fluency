import type { CEFR, SkillId } from "@/lib/types";

/**
 * Internal 0..100 scale. Not a CEFR certification: it is a progress indicator
 * calibrated so that exercise difficulty and skill rating share the same axis.
 */
export const LEVEL_BANDS: { level: CEFR; min: number }[] = [
  { level: "B1", min: 0 },
  { level: "B1+", min: 40 },
  { level: "B2", min: 47 },
  { level: "B2+", min: 56 },
  { level: "C1", min: 63 },
  { level: "C1+", min: 73 },
  { level: "C2", min: 82 },
];

/** Typical difficulty of an exercise written for a given level. */
export const LEVEL_DIFFICULTY: Record<CEFR, number> = {
  B1: 35,
  "B1+": 43,
  B2: 52,
  "B2+": 59,
  C1: 67,
  "C1+": 76,
  C2: 86,
};

export function ratingToLevel(r: number): CEFR {
  let out: CEFR = "B1";
  for (const b of LEVEL_BANDS) if (r >= b.min) out = b.level;
  return out;
}

/** Progress (0..1) inside the current band, used for the small progress bars. */
export function bandProgress(r: number): number {
  const i = LEVEL_BANDS.findLastIndex((b) => r >= b.min);
  const lo = LEVEL_BANDS[i].min;
  const hi = LEVEL_BANDS[i + 1]?.min ?? 100;
  return Math.max(0, Math.min(1, (r - lo) / (hi - lo)));
}

export interface SkillMeta {
  id: SkillId;
  label: string;
  short: string;
  description: string;
  requiresAudio?: boolean;
}

export const SKILLS: SkillMeta[] = [
  { id: "grammar", label: "Grammar", short: "Gram", description: "Tenses, aspect, conditionals, articles, advanced structures." },
  { id: "vocabulary", label: "Vocabulary", short: "Vocab", description: "Range and accuracy of words you can recognise and produce." },
  { id: "collocations", label: "Collocations", short: "Colloc", description: "Words that naturally go together: make a decision, heavy rain." },
  { id: "idioms", label: "Idiomatic language", short: "Idioms", description: "Idioms, phrasal verbs, fixed expressions used by fluent speakers." },
  { id: "register", label: "Register", short: "Reg", description: "Adapting tone: casual, neutral, professional, formal, academic." },
  { id: "precision", label: "Precision", short: "Prec", description: "Choosing the exact word rather than an approximate one." },
  { id: "nuance", label: "Nuance", short: "Nuance", description: "Understanding the difference between near-synonyms and subtle implications." },
  { id: "structure", label: "Sentence structure", short: "Struct", description: "Inversion, cleft sentences, nominalisation, subordination." },
  { id: "paraphrase", label: "Paraphrase", short: "Para", description: "Saying the same thing in a different way without losing meaning." },
  { id: "reading", label: "Reading & comprehension", short: "Read", description: "Understanding complex texts, implied meaning and tone." },
  { id: "writing", label: "Writing", short: "Write", description: "Producing clear, well-structured, natural written English." },
  { id: "listening", label: "Listening", short: "Listen", description: "Understanding fast natural speech.", requiresAudio: true },
  { id: "speaking", label: "Speaking", short: "Speak", description: "Spontaneous spoken production.", requiresAudio: true },
];

export const ACTIVE_SKILLS = SKILLS.filter((s) => !s.requiresAudio).map((s) => s.id);

export const skillLabel = (id: SkillId) => SKILLS.find((s) => s.id === id)?.label ?? id;
