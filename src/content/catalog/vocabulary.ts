import experiences from "./vocabulary/experiences.json";
import emotions from "./vocabulary/emotions.json";
import relationships from "./vocabulary/relationships.json";
import decisions from "./vocabulary/decisions.json";
import conversation from "./vocabulary/conversation.json";
import work from "./vocabulary/work.json";
import ideas from "./vocabulary/ideas.json";
import everyday from "./vocabulary/everyday.json";
import society from "./vocabulary/society.json";
import precision from "./vocabulary/precision.json";
import actions from "./vocabulary/actions.json";
import connections from "./vocabulary/connections.json";
import starter from "./vocabulary/starter.json";
import type { StarterPack, VocabularyPack } from "./types";

// Explicit imports keep the bundled catalogue available without a network request.
// npm run check:content validates the JSON as well as its references.
export const VOCABULARY_PACKS = [experiences, emotions, relationships, decisions, conversation, work, ideas, everyday, society, precision, actions, connections] as VocabularyPack[];
export const STARTER = starter as StarterPack;
export const CATALOG_ITEMS = [...STARTER.items, ...VOCABULARY_PACKS.flatMap(p => p.items)];
export const CATALOG_LISTS = [...STARTER.lists, ...VOCABULARY_PACKS.map(p => ({ id: `pack-${p.id}`, name: p.title, description: p.description, color: p.color }))];
export const CONTENT_VERSION = "2026.09.30-content.1";

/** Exact lexical identity for installs; no semantic guesses or fuzzy deletions. */
export function catalogTermKey(text: string) {
  return text.normalize("NFKC").trim().toLowerCase().replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ").replace(/^to\s+/, "")
    .replace(/\b(?:one|somebody|sb)'s\b/g, "someone's")
    .replace(/\b(?:somebody|sb)\b/g, "someone").replace(/\bsth\b/g, "something");
}
