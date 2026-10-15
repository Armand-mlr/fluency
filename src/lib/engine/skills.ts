import type { SkillId, SkillState } from "@/lib/types";

/**
 * Skill model: one Elo-style rating per skill, on the same 0..100 axis as
 * exercise difficulty.
 *
 * expected = probability you succeed, given your rating and the difficulty
 * new rating = rating + K * (actual score - expected)
 *
 * Succeeding at something hard moves you up a lot; failing something easy
 * moves you down a lot; doing what was expected barely moves anything.
 * K is large while the system knows little about you, then shrinks.
 */

export const DEFAULT_RATING = 55; // prior ≈ B2, deliberately not trusting self-assessment

const SCALE = 9; // how "steep" the success curve is

export function expectedScore(rating: number, difficulty: number): number {
  return 1 / (1 + Math.exp(-(rating - difficulty) / SCALE));
}

export function kFactor(attempts: number, mode: "diagnostic" | "practice"): number {
  if (mode === "diagnostic") return 12;
  if (attempts < 15) return 5;
  if (attempts < 60) return 3;
  return 2;
}

export function updateSkill(
  s: SkillState,
  score: number,
  difficulty: number,
  mode: "diagnostic" | "practice",
  weight = 1,
  now = Date.now(),
): SkillState {
  const exp = expectedScore(s.rating, difficulty);
  const k = kFactor(s.attempts, mode) * weight;
  const rating = Math.max(20, Math.min(98, s.rating + k * (score - exp)));
  const r = Math.round(rating * 10) / 10;
  const history = [...s.history];
  // keep at most one point per hour to keep history light
  const last = history[history.length - 1];
  if (last && now - last.t < 3_600_000) last.r = r;
  else history.push({ t: now, r });
  return { ...s, rating: r, attempts: s.attempts + 1, updatedAt: now, history: history.slice(-200) };
}

export function initialSkill(id: SkillId, now = Date.now()): SkillState {
  return { id, rating: DEFAULT_RATING, attempts: 0, updatedAt: now, history: [] };
}

/** How much the system wants you to work on a skill (0..1). */
export function weakness(rating: number, target = 82): number {
  return Math.max(0, Math.min(1, (target - rating) / 40));
}

/** Target difficulty: slightly above current rating ("desirable difficulty", ~65-75% success). */
export function targetDifficulty(rating: number) {
  return rating + 5;
}
