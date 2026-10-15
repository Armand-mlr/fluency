import type { Exercise, GradeResult } from "@/lib/types";

/**
 * Local grading, no API needed.
 * - closed formats (mcq, spot-error): exact
 * - short answers (cloze, rewrite, translate, correct): normalised comparison
 *   with accepted answers, typo tolerance, and "key feature" checks
 * - open production (free, explain): returns "self" -> the UI shows the model
 *   answer + rubric and you assess yourself (or the AI provider grades it)
 */

const CONTRACTIONS: [RegExp, string][] = [
  [/\bcan't\b/g, "cannot"],
  [/\bwon't\b/g, "will not"],
  [/\bshan't\b/g, "shall not"],
  [/n't\b/g, " not"],
  [/'re\b/g, " are"],
  [/'ve\b/g, " have"],
  [/'ll\b/g, " will"],
  [/'m\b/g, " am"],
  [/'d\b/g, " would"],
  [/\bit's\b/g, "it is"],
  [/\bthat's\b/g, "that is"],
  [/\bthere's\b/g, "there is"],
  [/\bwhat's\b/g, "what is"],
  [/\bhe's\b/g, "he is"],
  [/\bshe's\b/g, "she is"],
];

export function normalise(s: string): string {
  let t = s
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  for (const [re, rep] of CONTRACTIONS) t = t.replace(re, rep);
  t = t.replace(/[.,!?;:"()]/g, "").replace(/\s+/g, " ").trim();
  return t;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length) || 1;
  return 1 - levenshtein(a, b) / max;
}

function bestMatch(answer: string, accepted: string[]) {
  const n = normalise(answer);
  let best = { sim: 0, target: accepted[0] ?? "" };
  for (const acc of accepted) {
    const sim = similarity(n, normalise(acc));
    if (sim > best.sim) best = { sim, target: acc };
  }
  return best;
}

const test = (src: string, text: string) => {
  try {
    return new RegExp(src, "i").test(text);
  } catch {
    return text.toLowerCase().includes(src.toLowerCase());
  }
};

export function grade(ex: Exercise, answer: string | number): GradeResult {
  switch (ex.type) {
    case "mcq": {
      const ok = answer === ex.answer;
      return { score: ok ? 1 : 0, verdict: ok ? "correct" : "wrong", expected: ex.options[ex.answer] };
    }
    case "spot-error": {
      const ok = answer === ex.wrongIndex;
      const expected =
        ex.wrongIndex === -1 ? "No error" : `${ex.segments[ex.wrongIndex].trim()} → ${ex.correction}`;
      return { score: ok ? 1 : 0, verdict: ok ? "correct" : "wrong", expected };
    }
    case "cloze": {
      const a = String(answer).trim();
      if (!a.trim()) return { score: 0, verdict: "wrong", expected: ex.answers[0] };
      const { sim, target } = bestMatch(a, ex.answers);
      if (sim === 1) return { score: 1, verdict: "correct", expected: target };
      // short answers: allow a single typo only when the word is long enough
      const dist = levenshtein(normalise(a), normalise(target));
      if (dist === 1 && normalise(target).length >= 6)
        return { score: 0.85, verdict: "close", typo: true, expected: target, feedback: "Right word, small spelling slip." };
      return { score: 0, verdict: "wrong", expected: target };
    }
    case "rewrite":
    case "translate":
    case "correct": {
      const a = String(answer).trim();
      if (!a.trim()) return { score: 0, verdict: "wrong", expected: ex.model };
      const { sim, target } = bestMatch(a, [...ex.answers, ex.model]);
      if (sim === 1) return { score: 1, verdict: "correct", expected: target };
      // "correct the sentence": still closer to the original error than to the fix
      if (ex.type === "correct" && similarity(normalise(a), normalise(ex.prompt)) >= sim)
        return { score: 0, verdict: "wrong", expected: ex.model, feedback: "The error is still there." };
      if (sim >= 0.97 && !(ex.mustAvoid ?? []).some((r) => test(r, a)))
        return { score: 0.9, verdict: "close", typo: true, expected: target, feedback: "Nearly identical to the model: check the small details." };

      const avoided = (ex.mustAvoid ?? []).filter((r) => test(r, a));
      const groups = ex.mustInclude ?? [];
      const hit = groups.filter((alts) => alts.some((r) => test(r, a))).length;
      const featureRatio = groups.length ? hit / groups.length : 0;

      if (sim >= 0.9 && avoided.length === 0)
        return { score: 0.9, verdict: "close", typo: true, expected: target, feedback: "Almost identical to a model answer: check small details." };

      if (groups.length && featureRatio === 1 && avoided.length === 0) {
        // all the target features are there, but phrased differently: likely valid
        return {
          score: 0.8,
          verdict: "self",
          expected: ex.model,
          feedback: "You used the key structures. Compare with the model: is yours equally natural?",
        };
      }
      if (avoided.length) {
        return {
          score: 0.2,
          verdict: "wrong",
          expected: ex.model,
          feedback: "Your answer keeps the form the exercise asked you to move away from.",
        };
      }
      if (groups.length && featureRatio > 0) {
        return { score: 0.4 + 0.3 * featureRatio, verdict: "partial", expected: ex.model, feedback: "Part of the target structure is there, not all of it." };
      }
      // Unknown valid paraphrase is possible: let the learner judge against the model
      return { score: 0.5, verdict: "self", expected: ex.model };
    }
    case "free":
    case "explain":
      if(!String(answer).trim())return {score:0,verdict:"wrong",expected:ex.model,feedback:"Aucune réponse fournie. Étudiez le modèle et son explication."};
      return { score: 0.5, verdict: "self", expected: ex.model };
  }
}

export function needsAIReview(ex:Exercise,answer:string,result:GradeResult){
 if(!answer.trim())return false;
 if(ex.type==="free"||ex.type==="explain")return true;
 if(["rewrite","translate","correct"].includes(ex.type))return result.score!==1;
 return false;
}

/** When verdict === "self", the learner picks one of these. */
export const SELF_OPTIONS = [
  { label: "Mine was wrong", score: 0.1 },
  { label: "Close, but weaker", score: 0.6 },
  { label: "Equivalent or better", score: 1 },
] as const;

export function wordCount(s: string) {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}
