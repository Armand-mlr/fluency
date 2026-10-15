import type { Card, CardRef, CardState, Facet } from "@/lib/types";

/**
 * Spaced repetition: an adapted SM-2.
 *
 * You never rate yourself "Again / Good / Easy". The grade is inferred from
 * the attempt: score (0..1), and how fast you answered compared with what
 * the exercise should take. Less friction, more honest data.
 */

export type Grade = 0 | 1 | 2 | 3; // again, hard, good, easy

const MIN = 60_000;
const DAY = 86_400_000;

export const MIN_EASE = 1.3;
export const MAX_EASE = 3.0;

export function cardId(refType: CardRef, refId: string, facet: Facet) {
  return `${refType}:${refId}:${facet}`;
}

export function newCard(refType: CardRef, refId: string, facet: Facet, now = Date.now()): Card {
  return {
    id: cardId(refType, refId, facet),
    refType,
    refId,
    facet,
    state: "new",
    ease: 2.4,
    interval: 0,
    due: now,
    reps: 0,
    successes: 0,
    failures: 0,
    lapses: 0,
    difficulty: 0.5,
    createdAt: now,
  };
}

/** Turn an attempt into a grade. */
export function inferGrade(score: number, durationMs: number, expectedMs: number): Grade {
  if (score < 0.5) return 0;
  if (score < 0.85) return 1;
  // a correct answer that took much longer than expected = effortful retrieval
  if (durationMs > expectedMs * 2.2) return 1;
  if (score >= 0.99 && durationMs < expectedMs * 0.6) return 3;
  return 2;
}

export function stateFromInterval(interval: number, reps: number): CardState {
  if (reps === 0) return "learning";
  if (interval < 3) return "learning";
  if (interval < 21) return "familiar";
  return "mastered";
}

/**
 * Schedule the next review.
 * - Learning steps: 10 min, then 1 day, then the SM-2 multiplication.
 * - A failure on a known card is a "lapse": back to a short interval, ease drops.
 * - 3+ failures with low success makes the card a "leech": it gets extra,
 *   varied exercises (other formats, other contexts) instead of the same drill.
 */
export function schedule(card: Card, grade: Grade, now = Date.now()): Card {
  const c: Card = { ...card };
  c.lastReview = now;
  c.firstSeen ??= now;

  // running difficulty estimate (exponential moving average of failure)
  const fail = grade === 0 ? 1 : grade === 1 ? 0.6 : grade === 2 ? 0.2 : 0;
  c.difficulty = Math.round((c.difficulty * 0.7 + fail * 0.3) * 1000) / 1000;

  if (grade === 0) {
    c.failures += 1;
    if (c.reps > 0 && c.interval >= 1) c.lapses += 1;
    c.reps = 0;
    c.ease = Math.max(MIN_EASE, c.ease - 0.2);
    c.interval = 10 / (24 * 60); // 10 minutes, in days
    c.due = now + 10 * MIN;
  } else {
    c.successes += 1;
    c.reps += 1;
    if (grade === 1) c.ease = Math.max(MIN_EASE, c.ease - 0.12);
    if (grade === 3) c.ease = Math.min(MAX_EASE, c.ease + 0.12);

    let next: number;
    if (c.reps === 1) next = grade === 3 ? 3 : 1;
    else if (c.reps === 2) next = grade === 1 ? 2 : grade === 3 ? 7 : 4;
    else {
      const mult = grade === 1 ? 1.2 : grade === 3 ? c.ease * 1.3 : c.ease;
      next = Math.max(c.interval * mult, c.interval + 1);
    }
    // small fuzz so reviews don't all land on the same day
    const fuzz = next > 3 ? 1 + (Math.random() * 0.1 - 0.05) : 1;
    c.interval = Math.min(365, Math.round(next * fuzz * 100) / 100);
    c.due = now + c.interval * DAY;
  }

  c.state = stateFromInterval(c.interval, c.reps);
  c.leech = c.failures >= 3 && c.failures > c.successes * 0.6;
  return c;
}

/** Priority of a due card: overdue ratio, mistakes first, leeches boosted. */
export function reviewPriority(card: Card, now = Date.now()): number {
  const overdueDays = Math.max(0, (now - card.due) / DAY);
  const ratio = card.interval > 0 ? overdueDays / Math.max(card.interval, 0.5) : 1;
  let p = 1 + Math.min(ratio, 3);
  if (card.refType === "mistake") p += 2.5;
  if (card.leech) p += 1.5;
  if (card.state === "learning") p += 1;
  p += card.difficulty;
  return p;
}

export const STATE_LABEL: Record<CardState, string> = {
  new: "New",
  learning: "Learning",
  familiar: "Familiar",
  mastered: "Mastered",
};
