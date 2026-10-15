import type { Attempt, Card, Exercise, Mistake, Settings, SkillId, SkillState, VocabItem } from "@/lib/types";
import { reviewPriority } from "./srs";
import { targetDifficulty, weakness } from "./skills";
import { exerciseForItem, exerciseForMistake } from "./generator";
import { LEVEL_DIFFICULTY, skillLabel } from "./levels";
import { DAY, shuffle, startOfDay } from "@/lib/util";

/**
 * The session builder decides what you work on.
 *
 *  1. Review      : due memory cards (your mistakes first, then leeches, then the most overdue)
 *                   + a limited number of new items per day
 *  2. Practice    : bank exercises scored by weakness of the skill, recent failures on the
 *                   same tags, and "desirable difficulty" (slightly above your level)
 *  3. Production  : rewriting / register / free writing on your weakest productive skill
 *
 * Interleaving: never two consecutive exercises on the same skill or with the same format.
 */

export type Block = "review" | "practice" | "production";

export interface Planned {
  ex: Exercise;
  block: Block;
  reason: string;
}

export interface Context {
  now: number;
  cards: Card[];
  items: VocabItem[];
  mistakes: Mistake[];
  skills: SkillState[];
  attempts: Attempt[]; // recent (e.g. last 30 days)
  settings: Settings;
  bank: Exercise[]; // daily practice pool
  allExercises?: Exercise[]; // for resolving 'exercise' memory cards (bank + challenges)
}

const PRODUCTIVE: SkillId[] = ["writing", "register", "paraphrase", "structure", "precision"];

export function est(ex: Exercise) {
  return ex.estSeconds ?? ({ mcq: 18, cloze: 25, "spot-error": 20, rewrite: 50, translate: 45, correct: 35, free: 150, explain: 90 } as const)[ex.type];
}

function ratingOf(ctx: Context, s: SkillId) {
  return ctx.skills.find((x) => x.id === s)?.rating ?? 55;
}

/** Tags and skills you recently failed on, with a weight. */
export function recentWeakSpots(ctx: Pick<Context, "now" | "attempts">, days = 7) {
  const since = ctx.now - days * DAY;
  const tags = new Map<string, number>();
  const skills = new Map<SkillId, number>();
  for (const a of ctx.attempts) {
    if (a.createdAt < since) continue;
    const miss = a.score < 0.5 ? 1 : a.score < 0.85 ? 0.4 : -0.3;
    for (const t of a.tags) tags.set(t, (tags.get(t) ?? 0) + miss);
    for (const s of a.skills) skills.set(s, (skills.get(s) ?? 0) + miss);
  }
  return { tags, skills };
}

function lastSeen(ctx: Context) {
  const m = new Map<string, number>();
  for (const a of ctx.attempts) m.set(a.exerciseId, Math.max(m.get(a.exerciseId) ?? 0, a.createdAt));
  return m;
}

/** Score a bank exercise for this learner, right now. */
export function scoreExercise(ctx: Context, ex: Exercise, weak: ReturnType<typeof recentWeakSpots>, seen: Map<string, number>) {
  const main = ex.skills[0];
  const r = ratingOf(ctx, main);
  const w = weakness(r); // 0..1
  const fit = Math.max(0, 1 - Math.abs(ex.difficulty - targetDifficulty(r)) / 22);
  let tagBoost = 0;
  let tagWhy = "";
  for (const t of ex.tags) {
    const v = weak.tags.get(t) ?? 0;
    if (v > tagBoost) {
      tagBoost = v;
      tagWhy = t;
    }
  }
  tagBoost = Math.min(1.2, tagBoost * 0.35);
  const last = seen.get(ex.id);
  const recency = last ? Math.max(0, 1 - (ctx.now - last) / (14 * DAY)) * 2.5 : 0;
  const score = 2 * w + 1.2 * fit + tagBoost - recency + Math.random() * 0.35;
  const reason =
    tagBoost > 0.3 && tagWhy
      ? `Recent misses on ${tagWhy.replace(/-/g, " ")}`
      : w > 0.45
        ? `Weak spot: ${skillLabel(main)}`
        : `Stretching ${skillLabel(main)}`;
  return { score, reason };
}

/** Greedy pick with interleaving constraints. */
function interleavedPick(
  ranked: { ex: Exercise; score: number; reason: string }[],
  budgetSec: number,
  maxPerSkill: number,
  prev?: Exercise,
) {
  const out: typeof ranked = [];
  const perSkill = new Map<SkillId, number>();
  let used = 0;
  let last = prev;
  const pool = [...ranked];
  while (used < budgetSec && pool.length) {
    let idx = pool.findIndex(
      (c) =>
        (!last || (c.ex.skills[0] !== last.skills[0] && c.ex.type !== last.type)) &&
        (perSkill.get(c.ex.skills[0]) ?? 0) < maxPerSkill,
    );
    if (idx === -1) idx = pool.findIndex((c) => (perSkill.get(c.ex.skills[0]) ?? 0) < maxPerSkill);
    if (idx === -1) break;
    const [c] = pool.splice(idx, 1);
    out.push(c);
    used += est(c.ex);
    perSkill.set(c.ex.skills[0], (perSkill.get(c.ex.skills[0]) ?? 0) + 1);
    last = c.ex;
  }
  return out;
}

/** Build the review queue from memory cards. */
export function buildReview(ctx: Context, budgetSec: number, maxNew?: number): Planned[] {
  const { now } = ctx;
  const itemsById = new Map(ctx.items.map((i) => [i.id, i]));
  const mistakesById = new Map(ctx.mistakes.map((m) => [m.id, m]));
  const bankById = new Map((ctx.allExercises ?? ctx.bank).map((e) => [e.id, e]));
  const cardsById = new Map(ctx.cards.map((c) => [c.id, c]));

  const due = ctx.cards
    .filter((c) => !c.suspended && c.state !== "new" && c.due <= now)
    .sort((a, b) => reviewPriority(b, now) - reviewPriority(a, now));

  // new cards: your own mistakes always; items limited per day
  const today = startOfDay(now);
  const introducedToday = new Set(
    ctx.cards.filter((c) => c.refType === "item" && c.firstSeen && c.firstSeen >= today).map((c) => c.refId),
  );
  let newBudget = Math.max(0, (maxNew ?? ctx.settings.newItemsPerDay) - introducedToday.size);
  const newMistakes = ctx.cards.filter((c) => c.state === "new" && c.refType === "mistake");
  const newItemCards: Card[] = [];
  // Personal additions first; included entries close to the chosen level next.
  // Shuffle once before sorting so equal-ranked topics remain varied.
  const learnerDifficulty = LEVEL_DIFFICULTY[ctx.settings.currentLevel ?? "B2"];
  const levelDistance = (item?: VocabItem) => item?.level ? Math.abs(LEVEL_DIFFICULTY[item.level] - learnerDifficulty) : 0;
  const newRecognize = shuffle(ctx.cards
    .filter((c) => c.state === "new" && c.refType === "item" && c.facet === "recognize" && !c.suspended))
    .sort((a, b) => {
      const ia = itemsById.get(a.refId), ib = itemsById.get(b.refId);
      const ua = ia?.source !== "seed" ? 1 : 0, ub = ib?.source !== "seed" ? 1 : 0;
      return ub - ua || (ua && ub ? (ib?.createdAt ?? 0) - (ia?.createdAt ?? 0) : levelDistance(ia) - levelDistance(ib));
    });
  for (const c of newRecognize) {
    if (newBudget <= 0) break;
    newItemCards.push(c);
    newBudget--;
  }
  // produce cards become available once the item has been recognised once
  const newProduce = ctx.cards.filter(
    (c) => c.state === "new" && c.refType === "item" && c.facet === "produce" &&
      (cardsById.get(`item:${c.refId}:recognize`)?.successes ?? 0) > 0,
  );

  const queue: Planned[] = [];
  let used = 0;
  const pushCard = (c: Card, reason: string) => {
    let ex: Exercise | undefined;
    if (c.refType === "item") {
      const it = itemsById.get(c.refId);
      if (it) ex = exerciseForItem(it, c, ctx.items);
    } else if (c.refType === "mistake") {
      const m = mistakesById.get(c.refId);
      if (m) ex = exerciseForMistake(m, c);
    } else {
      const b = bankById.get(c.refId);
      if (b) ex = b;
    }
    if (!ex) return;
    if (queue.some((q) => q.ex.itemId && q.ex.itemId === ex!.itemId)) return; // one facet per item per session
    queue.push({ ex, block: "review", reason });
    used += est(ex);
  };

  for (const c of newMistakes) if (used < budgetSec) pushCard(c, "Your mistake");
  for (const c of due) {
    if (used >= budgetSec) break;
    pushCard(
      c,
      c.refType === "mistake" ? "Your mistake" : c.leech ? "Keeps slipping" : c.refType === "exercise" ? "Missed earlier" : "Due for review",
    );
  }
  for (const c of [...newProduce.slice(0, 3), ...newItemCards]) {
    if (used >= budgetSec) break;
    pushCard(c, c.facet === "produce" ? "Now produce it" : "New");
  }

  // interleave: spread same-type exercises apart
  return spread(queue);
}

function spread(q: Planned[]): Planned[] {
  const pool = shuffle(q);
  const out: Planned[] = [];
  while (pool.length) {
    const prev = out[out.length - 1];
    let i = pool.findIndex((p) => !prev || (p.ex.type !== prev.ex.type && p.ex.skills[0] !== prev.ex.skills[0]));
    if (i === -1) i = 0;
    out.push(pool.splice(i, 1)[0]);
  }
  // mistakes first feels right: fix what you got wrong while it's fresh
  return [...out.filter((p) => p.reason === "Your mistake"), ...out.filter((p) => p.reason !== "Your mistake")];
}

export function buildPractice(ctx: Context, budgetSec: number, exclude: Set<string>): Planned[] {
  const weak = recentWeakSpots(ctx);
  const seen = lastSeen(ctx);
  const ranked = ctx.bank
    .filter((e) => !exclude.has(e.id) && e.type !== "free" && e.type !== "explain")
    .map((ex) => ({ ex, ...scoreExercise(ctx, ex, weak, seen) }))
    .sort((a, b) => b.score - a.score);
  return interleavedPick(ranked, budgetSec, 2).map((c) => ({ ex: c.ex, block: "practice" as const, reason: c.reason }));
}

export function buildProduction(ctx: Context, budgetSec: number, exclude: Set<string>): Planned[] {
  const weak = recentWeakSpots(ctx);
  const seen = lastSeen(ctx);
  const ranked = ctx.bank
    .filter(
      (e) =>
        !exclude.has(e.id) &&
        (e.type === "rewrite" || e.type === "translate" || e.type === "free" || e.type === "explain") &&
        e.skills.some((s) => PRODUCTIVE.includes(s)),
    )
    .map((ex) => ({ ex, ...scoreExercise(ctx, ex, weak, seen) }))
    .sort((a, b) => b.score - a.score);
  // at most one long free-writing task per session
  const out: typeof ranked = [];
  let used = 0;
  let free = 0;
  for (const c of ranked) {
    if (used >= budgetSec) break;
    if (c.ex.type === "free" && free >= 1) continue;
    if (out.length && out[out.length - 1].ex.skills[0] === c.ex.skills[0]) continue;
    out.push(c);
    used += est(c.ex);
    if (c.ex.type === "free") free++;
  }
  return out.map((c) => ({ ex: c.ex, block: "production" as const, reason: c.reason }));
}

export function buildDailySession(ctx: Context): Planned[] {
  const total = ctx.settings.sessionMinutes * 60;
  const review = buildReview(ctx, total / 3);
  const used = new Set(review.map((p) => p.ex.id));
  const reviewTime = review.reduce((s, p) => s + est(p.ex), 0);
  // if there's little to review, practice gets the extra time
  const practice = buildPractice(ctx, total / 3 + Math.max(0, total / 3 - reviewTime), used);
  practice.forEach((p) => used.add(p.ex.id));
  const production = buildProduction(ctx, total / 3, used);
  return [...review, ...practice, ...production];
}

/** Challenge mode: harder than your level, mostly production. */
export function buildChallenge(ctx: Context, challenges: Exercise[], count = 5): Planned[] {
  const seen = lastSeen(ctx);
  const ranked = challenges
    .map((ex) => {
      const r = ratingOf(ctx, ex.skills[0]);
      const stretch = ex.difficulty - r; // we want +8..+20
      const fit = Math.max(0, 1 - Math.abs(stretch - 14) / 20);
      const last = seen.get(ex.id);
      const recency = last ? Math.max(0, 1 - (ctx.now - last) / (21 * DAY)) * 3 : 0;
      return { ex, score: fit + weakness(r) - recency + Math.random() * 0.5, reason: `Above your ${skillLabel(ex.skills[0])} level` };
    })
    .sort((a, b) => b.score - a.score);
  return interleavedPick(ranked, 99999, 2)
    .slice(0, count)
    .map((c) => ({ ex: c.ex, block: "production" as const, reason: c.reason }));
}
