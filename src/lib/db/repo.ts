import { db } from "./schema";
import type {
  Assessment,
  CEFR,
  Attempt,
  Card,
  Exercise,
  GradeResult,
  Mistake,
  Session,
  Settings,
  SkillId,
  SkillState,
  VocabItem,
  VocabList,
} from "@/lib/types";
import { cardId, inferGrade, newCard, schedule } from "@/lib/engine/srs";
import { initialSkill, updateSkill } from "@/lib/engine/skills";
import { LEVEL_DIFFICULTY, SKILLS } from "@/lib/engine/levels";
import { uid } from "@/lib/util";
import { SEED_LISTS, SEED_ITEMS } from "@/content/seedVocab";
import { STARTER, CONTENT_VERSION, catalogTermKey } from "@/content/catalog/vocabulary";
import { lessonById } from "@/content/catalog/lessons";

/**
 * Repository layer: the ONLY place that talks to the database.
 * Swap these implementations for API calls to go remote later.
 */

// ---------- bootstrap ----------

export const DEFAULT_SETTINGS: Settings = {
  id: "settings",
  sessionMinutes: 15,
  newItemsPerDay: 8,
  aiProvider: "none",
  aiModel: "",
  currentLevel: "B2",
  targetLevel: "C2",
  goals: "",
  interests: "",
  onboarded: false,
  dailyGoal: 20,
  name: "",
};

let seeding: Promise<void> | null = null;

export function ensureSeeded() {
  seeding ??= (async () => {
    const existingInstall = Boolean(await db.settings.get("settings"));
    await db.transaction("rw", [db.settings, db.skills, db.contentState, db.lists, db.items, db.cards], async () => {
      if (!(await db.settings.get("settings"))) await db.settings.put(DEFAULT_SETTINGS);
      for (const s of SKILLS) if (!(await db.skills.get(s.id))) await db.skills.put(initialSkill(s.id));
      await syncCatalog(existingInstall);
    });
    // ask the browser not to evict our data under storage pressure
    try {
      await navigator.storage?.persist?.();
    } catch {}
  })().catch(error => { seeding = null; throw error; });
  return seeding;
}

/** Add unseen catalogue IDs once. Never overwrite edited entries, cards or deleted content. */
export async function syncCatalog(existingInstall = true) {
  return db.transaction("rw", [db.contentState, db.lists, db.items, db.cards], async () => {
    const state = await db.contentState.get("catalog");
    // On upgrade, absent legacy seed IDs may have been deliberately deleted.
    const seenItems = new Set(state?.seenItemIds ?? (existingInstall ? STARTER.items.map(i => i.id) : []));
    const seenLists = new Set(state?.seenListIds ?? (existingInstall ? STARTER.lists.map(l => l.id) : []));
    const items = await db.items.toArray();
    const byId = new Map(items.map(i => [i.id, i]));
    const byTerm = new Map(items.map(i => [catalogTermKey(i.text), i]));
    const listIds = new Set((await db.lists.toArray()).map(l => l.id));
    const now = Date.now();
    let added = 0;
    for (const [index, list] of SEED_LISTS.entries()) {
      if (!seenLists.has(list.id) && !listIds.has(list.id)) {
        await db.lists.add({ ...list, createdAt: now + index, system: true });
        listIds.add(list.id);
      }
      seenLists.add(list.id);
    }
    const newItems: VocabItem[] = [];
    const newCards: Card[] = [];
    for (const seed of SEED_ITEMS) {
      if (seenItems.has(seed.id)) continue;
      const previous = byId.get(seed.id) ?? byTerm.get(catalogTermKey(seed.text));
      if (previous) {
        // Make an existing personal word discoverable in its topic without replacing its content.
        const memberships = [...new Set([...previous.listIds, ...seed.listIds.filter(id => listIds.has(id))])];
        if (memberships.length !== previous.listIds.length) {
          const merged = { ...previous, listIds: memberships };
          await db.items.put(merged);
          byTerm.set(catalogTermKey(seed.text), merged);
        }
      } else {
        const item: VocabItem = { ...seed, listIds: seed.listIds.filter(id => listIds.has(id)), source: "seed", createdAt: now };
        newItems.push(item);
        newCards.push(...itemCards(item.id, now));
        byTerm.set(catalogTermKey(item.text), item);
        added++;
      }
      seenItems.add(seed.id);
    }
    if (newItems.length) await db.items.bulkAdd(newItems);
    if (newCards.length) await db.cards.bulkAdd(newCards);
    await db.contentState.put({ id: "catalog", version: CONTENT_VERSION, seenItemIds: [...seenItems], seenListIds: [...seenLists] });
    return { added };
  });
}

export async function markLessonRead(id: string) {
  if (!lessonById(id)) throw new Error("Leçon inconnue.");
  await db.transaction("rw", db.lessonProgress, async () => {
    const previous = await db.lessonProgress.get(id);
    await db.lessonProgress.put({ id, completions: 0, ...previous, readAt: previous?.readAt ?? Date.now() });
  });
}

export async function completeLesson(id: string, score: number) {
  if (!lessonById(id) || !Number.isFinite(score) || score < 0 || score > 1) throw new Error("Résultat de leçon invalide.");
  await db.transaction("rw", db.lessonProgress, async () => {
    const previous = await db.lessonProgress.get(id);
    await db.lessonProgress.put({ id, readAt: previous?.readAt ?? Date.now(), completedAt: Date.now(),
      completions: (previous?.completions ?? 0) + 1, lastScore: score, bestScore: Math.max(previous?.bestScore ?? 0, score) });
  });
}

function itemCards(itemId: string, now = Date.now()): Card[] {
  const use = newCard("item", itemId, "use", now);
  use.suspended = true; // unlocked once you can produce the item
  return [newCard("item", itemId, "recognize", now), newCard("item", itemId, "produce", now), use];
}

// ---------- settings ----------

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get("settings")) ?? DEFAULT_SETTINGS;
}
export async function updateSettings(patch: Partial<Settings>) {
  await db.transaction("rw", db.settings, db.skills, async () => {
    const cur = await getSettings();
    const next = { ...cur, ...patch, id: "settings" as const };
    delete next.aiKey;
    await db.settings.put(next);
    if (patch.currentLevel) {
      for (const skill of await db.skills.toArray()) if (skill.attempts === 0) await db.skills.update(skill.id, { rating: LEVEL_DIFFICULTY[patch.currentLevel] });
    }
  });
}

// ---------- vocabulary ----------

export async function saveItem(input: Omit<VocabItem, "id" | "createdAt" | "source"> & { id?: string }) {
  const now = Date.now();
  if (input.id) {
    const prev = await db.items.get(input.id);
    if (prev) {
      await db.items.put({ ...prev, ...input, id: prev.id });
      return prev.id;
    }
  }
  const item: VocabItem = { ...input, id: uid(), createdAt: now, source: "user" };
  await db.transaction("rw", db.items, db.cards, async () => {
    await db.items.put(item);
    await db.cards.bulkPut(itemCards(item.id, now));
  });
  return item.id;
}

export async function deleteItem(id: string) {
  await db.transaction("rw", db.items, db.cards, async () => {
    await db.items.delete(id);
    await db.cards.where("[refType+refId]").equals(["item", id]).delete();
  });
}

export async function saveList(l: Partial<VocabList> & { name: string }) {
  const list: VocabList = {
    id: l.id ?? uid(),
    name: l.name,
    description: l.description,
    color: l.color ?? "#6b7280",
    createdAt: l.createdAt ?? Date.now(),
    system: l.system,
  };
  await db.lists.put(list);
  return list.id;
}

export async function deleteList(id: string) {
  await db.transaction("rw", db.lists, db.items, async () => {
    await db.lists.delete(id);
    const items = await db.items.where("listIds").equals(id).toArray();
    for (const it of items) await db.items.put({ ...it, listIds: it.listIds.filter((x) => x !== id) });
  });
}

// ---------- mistakes ----------

export async function saveMistake(m: Omit<Mistake, "id" | "count" | "lastSeen" | "createdAt"> & { id?: string }) {
  const now = Date.now();
  const prev = m.id ? await db.mistakes.get(m.id) : undefined;
  const mistake: Mistake = prev
    ? { ...prev, ...m, id: prev.id }
    : { ...m, id: m.id ?? uid(), count: 1, lastSeen: now, createdAt: now };
  await db.mistakes.put(mistake);
  const cid = cardId("mistake", mistake.id, "fix");
  if (!(await db.cards.get(cid))) await db.cards.put(newCard("mistake", mistake.id, "fix", now));
  return mistake.id;
}

export async function deleteMistake(id: string) {
  await db.transaction("rw", db.mistakes, db.cards, async () => {
    await db.mistakes.delete(id);
    await db.cards.where("[refType+refId]").equals(["mistake", id]).delete();
  });
}

/** Log a mistake that happened during practice (increments if already known). */
async function logMistake(m: Omit<Mistake, "count" | "lastSeen" | "createdAt">) {
  const now = Date.now();
  const prev = await db.mistakes.get(m.id);
  if (prev) {
    await db.mistakes.put({ ...prev, count: prev.count + 1, lastSeen: now, resolved: false });
    // an already-known mistake happening again: bring its card forward
    const c = await db.cards.get(cardId("mistake", m.id, "fix"));
    if (c) await db.cards.put(schedule(c, 0, now));
  } else {
    await db.mistakes.put({ ...m, count: 1, lastSeen: now, createdAt: now });
    await db.cards.put({ ...newCard("mistake", m.id, "fix", now), due: now + 10 * 60_000 });
  }
}

// ---------- recording answers (the heart of the adaptive loop) ----------

export interface RecordInput {
  ex: Exercise;
  result: GradeResult;
  answer: string;
  durationMs: number;
  mode: Attempt["mode"];
  sessionId?: string;
}

export async function recordAttempt({ ex, result, answer, durationMs, mode, sessionId }: RecordInput) {
  const now = Date.now();
  const score = result.score;

  await db.transaction("rw", [db.attempts, db.skills, db.cards, db.mistakes], async () => {
    // 1. attempt log
    await db.attempts.put({
      id: uid(),
      exerciseId: ex.id,
      exerciseType: ex.type,
      skills: ex.skills,
      tags: ex.tags,
      difficulty: ex.difficulty,
      score,
      answer,
      durationMs,
      createdAt: now,
      sessionId,
      mode,
      itemId: ex.itemId,
      mistakeId: ex.mistakeId,
    });

    // 2. skill ratings: the first skill is the main one, the others move less
    for (const [i, sid] of ex.skills.entries()) {
      const s = (await db.skills.get(sid)) ?? initialSkill(sid);
      await db.skills.put(
        updateSkill(s, score, ex.difficulty, mode === "diagnostic" ? "diagnostic" : "practice", i === 0 ? 1 : 0.5, now),
      );
    }

    // 3. memory cards
    const expectedMs = (ex.estSeconds ?? 30) * 1000;
    const g = inferGrade(score, durationMs, expectedMs);
    if (ex.itemId && ex.facet) {
      const id = cardId("item", ex.itemId, ex.facet);
      const c = (await db.cards.get(id)) ?? newCard("item", ex.itemId, ex.facet, now);
      await db.cards.put(schedule(c, g, now));
      // producing it successfully unlocks "use in context"
      if (ex.facet === "produce" && g > 0) {
        const use = await db.cards.get(cardId("item", ex.itemId, "use"));
        if (use?.suspended) await db.cards.put({ ...use, suspended: false, due: now + 86_400_000 });
      }
      // failing to produce an item you recognise: make recognition come back too
      if (ex.facet === "use" && g === 0) {
        const p = await db.cards.get(cardId("item", ex.itemId, "produce"));
        if (p && p.due > now + 86_400_000) await db.cards.put({ ...p, due: now + 86_400_000 });
      }
    } else if (ex.mistakeId) {
      const id = cardId("mistake", ex.mistakeId, "fix");
      const c = (await db.cards.get(id)) ?? newCard("mistake", ex.mistakeId, "fix", now);
      await db.cards.put(schedule(c, g, now));
      const m = await db.mistakes.get(ex.mistakeId);
      if (m) {
        const nc = await db.cards.get(id);
        await db.mistakes.put({ ...m, resolved: nc?.state === "mastered", lastSeen: g === 0 ? now : m.lastSeen, count: g === 0 ? m.count + 1 : m.count });
      }
    } else if (mode !== "diagnostic") {
      // bank exercise: failed ones get a card so they come back later
      const id = cardId("exercise", ex.id, "solve");
      const c = await db.cards.get(id);
      if (c) await db.cards.put(schedule(c, g, now));
      else if (score < 0.85) await db.cards.put(schedule(newCard("exercise", ex.id, "solve", now), g, now));
    }

    // 4. error capture
    if (score < 0.5 && ex.trap) {
      await logMistake({
        id: `trap:${ex.trap.key}`,
        wrong: ex.trap.wrong,
        correct: ex.trap.correct,
        type: ex.trap.type,
        cause: ex.trap.cause,
        explanation: ex.trap.explanation,
        frenchHint: ex.trap.frenchHint,
        source: mode === "diagnostic" ? "diagnostic" : "practice",
      });
    } else if (score < 0.5 && !ex.itemId && !ex.mistakeId && answer.trim() && ["correct", "translate", "cloze"].includes(ex.type)) {
      const correct = ex.type === "cloze" ? ex.prompt.split("\n")[0].replace("___", (ex as { answers: string[] }).answers[0]) : (ex as { model: string }).model;
      const wrong = ex.type === "cloze" ? ex.prompt.split("\n")[0].replace("___", answer.trim()) : answer.trim();
      if (wrong.toLowerCase() !== correct.toLowerCase())
        await logMistake({
          id: `ex:${ex.id}`,
          wrong,
          correct,
          type: ex.skills.includes("collocations") ? "collocation" : ex.skills.includes("register") ? "register" : ex.skills[0] === "grammar" ? "grammar" : "vocabulary",
          cause: "unknown",
          explanation: ex.explanation ?? "",
          source: mode === "diagnostic" ? "diagnostic" : "practice",
        });
    }
  });
}

// ---------- sessions ----------

export async function startSession(mode: Session["mode"], planned: number) {
  const s: Session = { id: uid(), startedAt: Date.now(), mode, planned, done: 0, correct: 0, durationMs: 0 };
  await db.sessions.put(s);
  return s.id;
}

export async function updateSession(id: string, patch: Partial<Session>) {
  const s = await db.sessions.get(id);
  if (s) await db.sessions.put({ ...s, ...patch });
}

// ---------- assessments ----------

export async function saveAssessment(a: Omit<Assessment, "id">) {
  const full = { ...a, id: uid() };
  await db.assessments.put(full);
  return full.id;
}

export async function setSkillRatings(ratings: Partial<Record<SkillId, number>>) {
  const now = Date.now();
  for (const [id, r] of Object.entries(ratings) as [SkillId, number][]) {
    const s = (await db.skills.get(id)) ?? initialSkill(id);
    await db.skills.put({ ...s, rating: r, updatedAt: now, history: [...s.history, { t: now, r }] });
  }
}

/**
 * Use an external test (analysed by the AI, or pre-analysed data) as extra evidence:
 * mistakes go into your database, levels are blended with current ratings
 * (30% weight: one test is a hint, not the truth).
 */
export async function applyTestAnalysis(a: {
  levels: Partial<Record<SkillId, CEFR>>;
  mistakes: { wrong: string; correct: string; type: Mistake["type"]; cause: Mistake["cause"]; explanation: string; frenchHint?: string }[];
  strengths: string[];
  weaknesses: string[];
  summary?: string;
}) {
  const now = Date.now();
  const results: Assessment["results"] = [];
  for (const [id, lvl] of Object.entries(a.levels) as [SkillId, CEFR][]) {
    const s = (await db.skills.get(id)) ?? initialSkill(id);
    const target = LEVEL_DIFFICULTY[lvl] ?? s.rating;
    const r = Math.round((s.attempts > 0 ? s.rating * 0.7 + target * 0.3 : target) * 10) / 10;
    await db.skills.put({ ...s, rating: r, updatedAt: now, history: [...s.history, { t: now, r }] });
    results.push({ skill: id, rating: r, level: lvl });
  }
  for (const m of a.mistakes) {
    await saveMistake({ ...m, source: "diagnostic" });
  }
  await saveAssessment({ date: now, source: "import", results, weakPoints: a.weaknesses, strengths: a.strengths, notes: a.summary });
}

// ---------- backup ----------

const TABLES = ["items", "lists", "mistakes", "cards", "attempts", "skills", "sessions", "assessments", "settings", "units", "lessonProgress", "contentState"] as const;

export async function exportAll() {
  const out: Record<string, unknown> = { app: "fluency", version: 2, exportedAt: new Date().toISOString() };
  for (const t of TABLES) out[t] = await db.table(t).toArray();
  out.settings = (out.settings as Settings[]).map(s => ({ ...s, aiKey: undefined, aiProvider: "none", aiModel: "" }));
  return out;
}

export async function importAll(data: Record<string, unknown>) {
  if (data.app !== "fluency") throw new Error("This file is not a Fluency backup.");
  for (const t of TABLES) {
    if ((t === "units" || t === "lessonProgress" || t === "contentState") && data[t] === undefined) continue;
    if (!Array.isArray(data[t]) || (data[t] as unknown[]).some(r => !r || typeof r !== "object" || typeof (r as {id?: unknown}).id !== "string")) throw new Error(`Invalid backup table: ${t}`);
  }
  for (const value of (data.contentState ?? []) as Record<string, unknown>[]) {
    if (value.id !== "catalog" || typeof value.version !== "string" || [value.seenItemIds, value.seenListIds].some(ids => !Array.isArray(ids) || ids.some(id => typeof id !== "string"))) throw new Error("Invalid backup table: contentState");
  }
  for (const value of (data.lessonProgress ?? []) as Record<string, unknown>[]) {
    const validNumber = (v: unknown, min: number, max = Infinity) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
    if (!validNumber(value.completions, 0) || !Number.isInteger(value.completions) || [value.readAt, value.completedAt].some(v => v !== undefined && !validNumber(v, 0)) || [value.bestScore, value.lastScore].some(v => v !== undefined && !validNumber(v, 0, 1))) throw new Error("Invalid backup table: lessonProgress");
  }
  data.settings = (data.settings as Settings[]).map(s => ({ ...s, aiKey: undefined, aiProvider: "none", aiModel: "" }));
  await db.transaction("rw", TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      await db.table(t).clear();
      const rows = data[t];
      if (Array.isArray(rows)) await db.table(t).bulkPut(rows);
    }
  });
  seeding = null;
  await ensureSeeded();
}

export async function resetAll() {
  await db.delete();
  location.reload();
}

export type { SkillState };

export async function importVocabulary(items: import("@/lib/imports/vocabulary").ImportItem[], policy: "skip" | "update", listIds: string[] = []) {
  const { normalizeTerm } = await import("@/lib/imports/vocabulary");
  return db.transaction("rw", db.items, db.cards, async () => {
    const existing = new Map((await db.items.toArray()).map(i => [normalizeTerm(i.text), i]));
    const report = { added: 0, updated: 0, ignored: 0 };
    for (const entry of items) {
      const { provided, ...input } = entry;
      const prev = existing.get(normalizeTerm(input.text));
      if (prev && policy === "skip") { report.ignored++; continue; }
      const clean = Object.fromEntries(Object.entries(input).filter(([k,v]) => (!provided || provided.includes(k)) && v !== "" && v !== undefined && (!Array.isArray(v) || v.length))) as Partial<typeof input>;
      const item: VocabItem = prev ? { ...prev, ...clean, listIds: [...new Set([...prev.listIds, ...listIds])] } : { ...input, id: uid(), createdAt: Date.now(), source: "user", listIds };
      await db.items.put(item);
      if (!prev) await db.cards.bulkPut(itemCards(item.id));
      existing.set(normalizeTerm(item.text), item);
      report[prev ? "updated" : "added"]++;
    }
    return report;
  });
}
export async function saveUnit(unit: Omit<import("@/lib/types").StudyUnit, "id" | "createdAt">) {
  const row = { ...unit, id: uid(), createdAt: Date.now() };
  await db.units.put(row); return row;
}
export async function deleteUnit(id: string) { await db.units.delete(id); }
