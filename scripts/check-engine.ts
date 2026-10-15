/**
 * Sanity checks for the learning engine and the content bank.
 * Run with: npm run check
 */
import { ALL_EXERCISES } from "../src/content";
import { DIAGNOSTIC } from "../src/content/diagnostic";
import { SEED_ITEMS } from "../src/content/seedVocab";
import { NUANCE_SETS } from "../src/content/nuance";
import { grade } from "../src/lib/engine/grader";
import { locateInExample, exerciseForItem } from "../src/lib/engine/generator";
import { newCard, schedule, inferGrade } from "../src/lib/engine/srs";
import { updateSkill, initialSkill } from "../src/lib/engine/skills";
import { buildDailySession } from "../src/lib/engine/session";
import { BANK } from "../src/content";
import type { VocabItem } from "../src/lib/types";

let fails = 0;
const ok = (cond: unknown, msg: string) => {
  if (!cond) {
    fails++;
    console.log("✗", msg);
  }
};

// ---- content integrity
const all = [...ALL_EXERCISES, ...DIAGNOSTIC];
const ids = new Set<string>();
for (const e of all) {
  ok(!ids.has(e.id), `duplicate id ${e.id}`);
  ids.add(e.id);
  if (e.type === "mcq") ok(e.answer >= 0 && e.answer < e.options.length, `${e.id}: answer index`);
  if (e.type === "spot-error") ok(e.wrongIndex >= -1 && e.wrongIndex < e.segments.length, `${e.id}: wrongIndex`);
  if (e.type === "cloze") {
    ok(e.prompt.includes("___"), `${e.id}: cloze has no blank`);
    for (const a of e.answers) ok(grade(e, a).score === 1, `${e.id}: accepted answer "${a}" not graded correct`);
  }
  if (e.type === "rewrite" || e.type === "translate" || e.type === "correct") {
    ok(grade(e, e.model).score >= 0.8, `${e.id}: model answer scores ${grade(e, e.model).score}`);
    for (const a of e.answers) ok(grade(e, a).score >= 0.8, `${e.id}: accepted "${a}" scores ${grade(e, a).score}`);
    // mustInclude regexes must be valid
    for (const g of e.mustInclude ?? []) for (const r of g) ok((() => { try { new RegExp(r); return true; } catch { return false; } })(), `${e.id}: bad regex ${r}`);
    if (e.type === "correct") ok(grade(e, e.prompt).score < 0.5, `${e.id}: leaving the error unchanged should fail (${grade(e, e.prompt).score})`);
  }
}
for (const s of NUANCE_SETS)
  for (const d of s.drills) ok(s.words.some((w) => d.answer.toLowerCase().startsWith(w.word.toLowerCase())), `${s.id}: drill answer ${d.answer} not in set`);

// ---- grader behaviour
const deal = ALL_EXERCISES.find((e) => e.id === "r-deal-with")!;
ok(grade(deal, "The government must tackle this issue swiftly.").score >= 0.8, "valid paraphrase accepted");
ok(grade(deal, "The government needs to deal with this problem quickly.").score < 0.5, "unchanged sentence rejected");
ok(grade(deal, "The government should address the matter without delay.").verdict === "self", "unknown valid paraphrase goes to self-check");
const forSince = ALL_EXERCISES.find((e) => e.id === "g-for-since")!;
ok(grade(forSince, "since").score === 0, "since rejected");
ok(grade(forSince, " For ").score === 1, "case/space-insensitive");

// ---- generator: locate conjugated items in examples
const items = SEED_ITEMS.map((i) => ({ ...i, source: "seed", createdAt: 0 }) as VocabItem);
let located = 0;
for (const it of items) if (locateInExample(it)) located++;
console.log(`located ${located}/${items.length} seed items inside their example`);
const come = items.find((i) => i.id === "s-come-across")!;
ok(locateInExample(come) === "came across", `come across → ${locateInExample(come)}`);
const putOff = items.find((i) => i.id === "s-put-off")!;
ok(locateInExample(putOff) === "put off", `put off → ${locateInExample(putOff)}`);
for (const it of items) for (const f of ["recognize", "produce", "use"] as const) exerciseForItem(it, newCard("item", it.id, f), items);

// ---- SRS: intervals grow on success, collapse on failure
let c = newCard("item", "x", "produce", 0);
const seq: number[] = [];
let t = 0;
for (let k = 0; k < 6; k++) {
  c = schedule(c, 2, t);
  seq.push(Math.round(c.interval));
  t = c.due;
}
console.log("intervals (good x6):", seq.join(", "), "→ state", c.state);
ok(seq[5] > 30 && c.state === "mastered", "good answers lead to mastered");
c = schedule(c, 0, t);
ok(c.interval < 0.01 && c.lapses === 1 && c.state === "learning", "failure resets");
ok(inferGrade(1, 5000, 20000) === 3 && inferGrade(1, 60000, 20000) === 1 && inferGrade(0.2, 1, 1) === 0, "grade inference");

// ---- skills: hard success moves more than easy success
const s0 = initialSkill("grammar", 0);
const hard = updateSkill(s0, 1, 86, "practice", 1, 0).rating - 55;
const easy = updateSkill(s0, 1, 40, "practice", 1, 0).rating - 55;
ok(hard > easy * 3, `hard success +${hard.toFixed(2)} vs easy +${easy.toFixed(2)}`);

// ---- session builder on a fresh profile
const now = Date.now();
const cards = items.flatMap((it) => {
  const u = newCard("item", it.id, "use", now);
  u.suspended = true;
  return [newCard("item", it.id, "recognize", now), newCard("item", it.id, "produce", now), u];
});
const plan = buildDailySession({
  now,
  cards,
  items,
  mistakes: [],
  skills: [],
  attempts: [],
  bank: BANK,
  settings: { id: "settings", sessionMinutes: 15, newItemsPerDay: 8, aiProvider: "none", onboarded: true, dailyGoal: 20 },
});
const blocks = plan.reduce<Record<string, number>>((m, p) => ((m[p.block] = (m[p.block] ?? 0) + 1), m), {});
console.log("fresh session:", plan.length, "exercises", blocks);
ok(plan.length >= 10, "session has content");
for (let k = 1; k < plan.length; k++)
  if (plan[k].block === "practice" && plan[k - 1].block === "practice")
    ok(plan[k].ex.skills[0] !== plan[k - 1].ex.skills[0] || plan[k].ex.type !== plan[k - 1].ex.type, `interleaving at ${k}`);

console.log(`\n${all.length} exercises checked, ${fails ? `${fails} FAILURE(S)` : "all good"}`);
process.exit(fails ? 1 : 0);
