import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { db } from "../src/lib/db/schema";
import { ensureSeeded, syncCatalog, deleteItem, deleteList, markLessonRead, completeLesson, exportAll, importAll } from "../src/lib/db/repo";
import { CATALOG_ITEMS, CATALOG_LISTS, STARTER, VOCABULARY_PACKS, catalogTermKey } from "../src/content/catalog/vocabulary";
import { LESSONS } from "../src/content/catalog/lessons";
import { cardId } from "../src/lib/engine/srs";

async function main() {
  await ensureSeeded();
  await ensureSeeded();
  assert.equal(await db.items.count(), CATALOG_ITEMS.length);
  assert.equal(await db.cards.count(), CATALOG_ITEMS.length * 3);
  assert.equal(await db.lists.count(), CATALOG_LISTS.length);
  const id = VOCABULARY_PACKS[0].items[0].id;
  const produceId = cardId("item", id, "produce");
  await db.items.update(id, { notes: "My personal note", example: "My own example." });
  await db.cards.update(produceId, { successes: 9, due: 123456789, state: "mastered" });
  const beforeCard = await db.cards.get(produceId);
  const beforeItem = await db.items.get(id);
  assert.equal((await syncCatalog()).added, 0);
  assert.deepEqual(await db.cards.get(produceId), beforeCard);
  assert.deepEqual(await db.items.get(id), beforeItem);

  await deleteItem(id);
  await deleteList("pack-experiences");
  await syncCatalog();
  assert.equal(await db.items.get(id), undefined, "Deleted entries must stay deleted");
  assert.equal(await db.lists.get("pack-experiences"), undefined, "Deleted lists must stay deleted");
  assert.ok(!(await db.items.toArray()).some(i => i.listIds.includes("pack-experiences")));
  await markLessonRead(LESSONS[0].id);
  await completeLesson(LESSONS[0].id, 0.75);
  await completeLesson(LESSONS[0].id, 0.5);
  const progress = await db.lessonProgress.get(LESSONS[0].id);
  assert.equal(progress?.completions, 2);
  assert.equal(progress?.bestScore, 0.75);
  const backup = await exportAll();
  const stableCount = await db.items.count();
  await assert.rejects(importAll({ ...backup, contentState: [{ id: "catalog", version: "bad", seenItemIds: 7, seenListIds: [] }] }), /contentState/);
  await assert.rejects(importAll({ ...backup, lessonProgress: [{ id: LESSONS[0].id, completions: -1 }] }), /lessonProgress/);
  assert.equal(await db.items.count(), stableCount, "Bad metadata must be rejected before any replacement");
  await importAll(backup);
  assert.deepEqual(await db.lessonProgress.get(LESSONS[0].id), progress);
  assert.equal(await db.items.get(id), undefined, "Deleted content stays deleted after backup restore");

  // Reproduce an older installation with personal changes and a deleted starter word.
  const old: Record<string, unknown> = { ...backup, version: 1 };
  delete old.contentState; delete old.lessonProgress;
  const legacy = STARTER.items[0];
  const duplicateSeed = VOCABULARY_PACKS[0].items[1];
  const custom = { ...duplicateSeed, id: "personal-existing", text: `TO ${duplicateSeed.text.toUpperCase()}`, source: "user", notes: "Keep my nuance", createdAt: 99, listIds: [STARTER.lists[0].id] };
  old.items = [{ ...legacy, notes: "Edited in old version", createdAt: 50, source: "seed" }, custom];
  old.lists = STARTER.lists.map(l => ({ ...l, createdAt: 1 }));
  old.cards = [{ ...beforeCard!, id: cardId("item", custom.id, "produce"), refId: custom.id }];
  old.attempts = []; old.sessions = []; old.mistakes = [];
  await importAll(old);
  assert.equal((await db.items.get(legacy.id))?.notes, "Edited in old version");
  assert.equal(await db.items.get(STARTER.items[1].id), undefined, "Old deletions must not be undone");
  const retained = await db.items.get(custom.id);
  assert.equal(retained?.notes, "Keep my nuance");
  assert.equal(retained?.createdAt, 99);
  assert.ok(retained?.listIds.includes(duplicateSeed.listIds[0]));
  assert.equal((await db.items.toArray()).filter(i => catalogTermKey(i.text) === catalogTermKey(duplicateSeed.text)).length, 1);
  assert.deepEqual(await db.cards.get(cardId("item", custom.id, "produce")), (old.cards as unknown[])[0]);
  assert.equal((await syncCatalog()).added, 0);

  // An interrupted catalogue installation must roll back all four tables.
  await db.transaction("rw", [db.contentState, db.items, db.lists, db.cards], async () => {
    await db.contentState.clear(); await db.items.clear(); await db.lists.clear(); await db.cards.clear();
  });
  const bulkAdd = db.items.bulkAdd.bind(db.items);
  db.items.bulkAdd = (() => { throw new Error("injected install failure"); }) as typeof db.items.bulkAdd;
  await assert.rejects(syncCatalog(false), /injected/);
  assert.equal(await db.lists.count(), 0);
  assert.equal(await db.contentState.count(), 0);
  assert.equal(await db.cards.count(), 0);
  db.items.bulkAdd = bulkAdd;
  assert.equal((await syncCatalog(false)).added, CATALOG_ITEMS.length);
  db.close();
  console.log("Fresh install, existing-profile upgrade, personal duplicates, unchanged SRS, deletions, lesson progress, old/new backups and atomic rollback: passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
