/** Writing Lab: sentence-upgrade ladders. You try first, then climb step by step. */

export interface LadderStep {
  level: "B2" | "C1" | "C2";
  text: string;
  moves: string[]; // what changed, named precisely
  why: string;
}

export interface Ladder {
  id: string;
  title: string;
  context: string;
  goal: string; // what the upgrade should achieve
  base: string;
  steps: LadderStep[];
  alternatives: { text: string; when: string }[];
  register: string;
}

import starter from "./catalog/writing/starter.json";
import extended from "./catalog/writing/extended.json";
export const LADDERS = [...starter, ...extended] as Ladder[];
