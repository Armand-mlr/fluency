import assert from "node:assert/strict";
import { CATALOG_ITEMS, CATALOG_LISTS, VOCABULARY_PACKS, catalogTermKey } from "../src/content/catalog/vocabulary";
import { LESSONS, LESSON_EXERCISES, LEARNING_PATHS, TRACKS } from "../src/content/catalog/lessons";
import { ALL_EXERCISES } from "../src/content";
import { DIAGNOSTIC } from "../src/content/diagnostic";
import { grade, wordCount } from "../src/lib/engine/grader";
import { parseVocabulary } from "../src/lib/imports/vocabulary";

const unique = (values: string[], label: string) => assert.equal(new Set(values).size, values.length, `Duplicate ${label}: ${values.filter((v, i) => values.indexOf(v) !== i).join(", ")}`);
unique(CATALOG_ITEMS.map(i => i.id), "vocabulary IDs");
unique(CATALOG_ITEMS.map(i => catalogTermKey(i.text)), "terms");
unique(CATALOG_LISTS.map(l => l.id), "lists");
unique(LESSONS.map(l => l.id), "lessons");
unique([...ALL_EXERCISES, ...DIAGNOSTIC].map(e => e.id), "exercises");
const advanced = VOCABULARY_PACKS.flatMap(p => p.items);
assert.ok(advanced.length >= 500, "At least 500 new entries");
unique(advanced.map(i => i.example!), "new examples");
const listIds = new Set(CATALOG_LISTS.map(l => l.id));
for (const pack of VOCABULARY_PACKS) {
  assert.equal(pack.version, 1);
  assert.ok(pack.items.length >= 30, pack.id);
  const parsed = parseVocabulary(JSON.stringify({ version: 1, items: pack.items }));
  assert.equal(parsed.filter(r => r.errors.length).length, 0, `${pack.id}: invalid import structure`);
  for (const item of pack.items) {
    for (const k of ["meaning", "translationFr", "example", "exampleFr", "notes"] as const) assert.ok(item[k] && item[k]!.trim().length >= (k === "translationFr" ? 2 : 8), `${item.text}: missing ${k}`);
    assert.ok(["B2+", "C1", "C1+", "C2"].includes(item.level), `${item.text}: level`);
    for (const id of item.listIds) assert.ok(listIds.has(id), `Unknown list ${id}`);
  }
}
for (const lesson of LESSONS) {
  assert.ok(lesson.track in TRACKS);
  assert.ok(lesson.sections.length && lesson.pitfalls.length && lesson.recallPrompt && lesson.takeaway, lesson.id);
  assert.ok(lesson.sections.every(s => s.body.length >= 200 && s.pattern && s.examples.length >= 2), `${lesson.id}: incomplete teaching`);
  assert.deepEqual(lesson.exercises.map(e => e.type), ["mcq", "cloze", "rewrite", "free"]);
  for (const id of lesson.relatedListIds) assert.ok(listIds.has(id), `${lesson.id}: unknown pack`);
  for (const exercise of lesson.exercises) {
    assert.ok(exercise.explanation && exercise.explanation.length > 40, `${exercise.id}: explanation`);
    if (exercise.type === "mcq") {
      unique(exercise.options, exercise.id);
      assert.ok(exercise.answer >= 0 && exercise.answer < exercise.options.length);
      assert.equal(exercise.optionNotes?.length, exercise.options.length);
      for (const [index] of exercise.options.entries()) assert.equal(grade(exercise, index).score, index === exercise.answer ? 1 : 0);
    }
    if (exercise.type === "cloze") {
      assert.ok(exercise.prompt.includes("___"));
      for (const answer of exercise.answers) assert.equal(grade(exercise, answer).score, 1, exercise.id);
    }
    if (exercise.type === "rewrite") assert.equal(grade(exercise, exercise.model).score, 1, exercise.id);
    if (exercise.type === "free") {
      assert.ok(exercise.rubric.length >= 3);
      assert.ok(wordCount(exercise.model) >= (exercise.minWords ?? 1), `${exercise.id}: model too short`);
      assert.ok(wordCount(exercise.model) <= (exercise.maxWords ?? Infinity), `${exercise.id}: model too long`);
    }
  }
}
for (const path of LEARNING_PATHS) for (const id of path.lessons) assert.ok(LESSONS.some(l => l.id === id), `${path.id}: ${id}`);
assert.ok(LESSONS.every(l => LEARNING_PATHS.some(p => (p.lessons as readonly string[]).includes(l.id))), "Every lesson has a path");
console.log(`${CATALOG_ITEMS.length} vocabulary entries (${advanced.length} new), ${VOCABULARY_PACKS.length} packs, ${LESSONS.length} lessons, ${LESSON_EXERCISES.length} new exercises: valid.`);
