import Dexie, { type EntityTable } from "dexie";
import type {
  ContentState,
  LessonProgress,
  StudyUnit,
  Assessment,
  Attempt,
  Card,
  Mistake,
  Session,
  Settings,
  SkillState,
  VocabItem,
  VocabList,
} from "@/lib/types";

/**
 * The local database (IndexedDB, through Dexie).
 * Only index the fields we query on: the rest of each object is stored as-is.
 *
 * To move to a remote database later, keep this shape and re-implement
 * the functions in repo.ts: components never touch `db` directly.
 */
export class FluencyDB extends Dexie {
  contentState!: EntityTable<ContentState, "id">;
  lessonProgress!: EntityTable<LessonProgress, "id">;
  units!: EntityTable<StudyUnit, "id">;
  items!: EntityTable<VocabItem, "id">;
  lists!: EntityTable<VocabList, "id">;
  mistakes!: EntityTable<Mistake, "id">;
  cards!: EntityTable<Card, "id">;
  attempts!: EntityTable<Attempt, "id">;
  skills!: EntityTable<SkillState, "id">;
  sessions!: EntityTable<Session, "id">;
  assessments!: EntityTable<Assessment, "id">;
  settings!: EntityTable<Settings, "id">;

  constructor() {
    super("fluency");
    this.version(1).stores({
      items: "id, kind, level, createdAt, *listIds, *tags",
      lists: "id, name, createdAt",
      mistakes: "id, type, count, lastSeen, createdAt",
      cards: "id, [refType+refId], refType, facet, state, due, leech",
      attempts: "id, exerciseId, createdAt, sessionId, mode, *skills, *tags",
      skills: "id",
      sessions: "id, startedAt",
      assessments: "id, date",
      settings: "id",
    });
    this.version(2).stores({ units: "id, createdAt" }).upgrade(async tx => {
      await tx.table("settings").toCollection().modify(s => { delete s.aiKey; s.aiProvider = "none"; s.currentLevel ??= "B2"; s.targetLevel ??= "C2"; });
    });
    this.version(3).stores({ contentState: "id", lessonProgress: "id, completedAt" });
  }
}

// Single shared instance (browser only).
export const db = new FluencyDB();
