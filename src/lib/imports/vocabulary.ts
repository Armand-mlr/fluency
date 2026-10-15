import type { CEFR, ItemKind, Register, VocabItem } from "@/lib/types";
import { LEVELS } from "@/lib/ai/config";
export type ImportItem = Omit<VocabItem, "id" | "createdAt" | "source" | "listIds"> & { provided?: string[] };
export interface ImportRow { index: number; item?: ImportItem; errors: string[] }
export const VOCAB_EXAMPLE = { version: 1, items: [
  { kind: "expression", text: "to strike a balance", translationFr: "trouver un équilibre", meaning: "To find a suitable compromise", example: "We need to strike a balance between speed and quality.", exampleFr: "Nous devons trouver un équilibre entre rapidité et qualité.", level: "C1", tags: ["work", "daily life"] },
  { kind: "word", text: "thoughtful", translationFr: "attentionné ; réfléchi" }
] };
export const normalizeTerm = (text: string) => text.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
const kinds = ["word", "expression", "collocation", "phrasal-verb", "idiom", "sentence", "structure"];
const registers = ["casual", "neutral", "professional", "formal", "academic", "literary"];
export function parseVocabulary(raw: string): ImportRow[] {
  if (raw.length > 2_000_000) throw new Error("Fichier trop volumineux : maximum 2 Mo.");
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error("JSON invalide : vérifiez les guillemets, virgules et crochets."); }
  if (!data || data.version !== 1 || !Array.isArray(data.items)) throw new Error('Format attendu : { "version": 1, "items": [...] }.');
  if (!data.items.length || data.items.length > 2000) throw new Error("La liste doit contenir entre 1 et 2 000 entrées.");
  return data.items.map((value: unknown, index: number) => {
    const errors: string[] = [];
    if (!value || typeof value !== "object" || Array.isArray(value)) return { index, errors: ["entrée : un objet est attendu"] };
    const v = value as Record<string, unknown>;
    const str = (key: string, max = 3000) => {
      if (v[key] === undefined || v[key] === null) return "";
      if (typeof v[key] !== "string") { errors.push(`${key} : texte attendu`); return ""; }
      const s = (v[key] as string).normalize("NFKC").trim().replace(/\s+/g, " ");
      if (s.length > max) errors.push(`${key} : maximum ${max} caractères`);
      return s;
    };
    const text = str("text", 300), meaning = str("meaning"), translationFr = str("translationFr");
    if (!text) errors.push("text : terme anglais obligatoire");
    if (!meaning && !translationFr) errors.push("translationFr ou meaning : renseignez au moins une traduction ou définition");
    if (v.kind !== undefined && v.kind !== null && v.kind !== "" && !kinds.includes(String(v.kind))) errors.push("kind : type inconnu");
    if (v.level !== undefined && v.level !== null && v.level !== "" && !LEVELS.includes(v.level as CEFR)) errors.push("level : B1, B1+, B2, B2+, C1, C1+ ou C2 attendu");
    if (v.register !== undefined && v.register !== null && v.register !== "" && !registers.includes(String(v.register))) errors.push("register : registre inconnu");
    if (v.tags !== undefined && v.tags !== null && (!Array.isArray(v.tags) || v.tags.length > 30 || v.tags.some(t => typeof t !== "string" || t.length > 80))) errors.push("tags : liste de 30 textes courts maximum");
    const item: ImportItem = { provided: Object.keys(v), text, meaning, translationFr, kind: (v.kind || "word") as ItemKind, level: (v.level ?? "") as CEFR, register: (v.register || "neutral") as Register, example: str("example"), exampleFr: str("exampleFr"), notes: str("notes"), tags: Array.isArray(v.tags) ? [...new Set(v.tags.filter(t => typeof t === "string").map(t => t.trim()).filter(Boolean))] as string[] : [] };
    return { index, item: errors.length ? undefined : item, errors };
  });
}
