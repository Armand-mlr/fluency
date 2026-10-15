import type { Exercise } from "@/lib/types";
import { GRAMMAR } from "./bank/grammar";
import { LEXIS } from "./bank/lexis";
import { STYLE } from "./bank/style";
import { CHALLENGES } from "./challenges";
import { LESSON_EXERCISES } from "./catalog/lessons";

/** Practice bank used by daily sessions. */
export const BANK: Exercise[] = [...GRAMMAR, ...LEXIS, ...STYLE, ...LESSON_EXERCISES];

/** Everything that can be referenced by an "exercise" memory card. */
export const ALL_EXERCISES: Exercise[] = [...BANK, ...CHALLENGES];

export { CHALLENGES };
export const exerciseById = (id: string) => ALL_EXERCISES.find((e) => e.id === id);
