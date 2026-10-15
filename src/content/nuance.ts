import type { Register } from "@/lib/types";

/** Register & Nuance: families of near-synonyms, and quick "which fits?" drills. */

export interface NuanceWord {
  word: string;
  register: Register;
  connotation: "positive" | "neutral" | "negative" | "technical";
  frequency: "very common" | "common" | "less common" | "rare";
  note: string;
  collocations: string[];
  example: string;
}

export interface NuanceSet {
  id: string;
  title: string;
  idea: string;
  words: NuanceWord[];
  takeaway: string;
  drills: { prompt: string; answer: string; why: string }[];
}

import starter from "./catalog/nuance/starter.json";
import extended from "./catalog/nuance/extended.json";
export const NUANCE_SETS = [...starter, ...extended] as NuanceSet[];
