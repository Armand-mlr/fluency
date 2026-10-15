import type {
  ClozeExercise,
  FreeExercise,
  McqExercise,
  RewriteExercise,
  SpotErrorExercise,
} from "@/lib/types";

/** Content helpers: write exercises with a level instead of a raw difficulty. */

export const D = { B2: 52, "B2+": 59, C1: 67, "C1+": 76, C2: 86 } as const;
type L = keyof typeof D;
type Lv<T> = Omit<T, "type" | "difficulty" | "origin"> & { level: L; difficulty?: number };

const base = <T extends { level: L; difficulty?: number }>(o: T) => {
  const { level, ...rest } = o;
  return { ...rest, difficulty: o.difficulty ?? D[level], origin: "bank" as const };
};

export const mcq = (o: Lv<McqExercise>): McqExercise => ({ ...base(o), type: "mcq" });
export const cloze = (o: Lv<ClozeExercise>): ClozeExercise => ({ ...base(o), type: "cloze" });
export const rewrite = (o: Lv<Omit<RewriteExercise, "type">>): RewriteExercise => ({ ...base(o), type: "rewrite" });
export const translate = (o: Lv<Omit<RewriteExercise, "type">>): RewriteExercise => ({ ...base(o), type: "translate" });
export const correct = (o: Lv<Omit<RewriteExercise, "type">>): RewriteExercise => ({ ...base(o), type: "correct" });
export const spot = (o: Lv<SpotErrorExercise>): SpotErrorExercise => ({ ...base(o), type: "spot-error" });
export const free = (o: Lv<Omit<FreeExercise, "type">>): FreeExercise => ({ ...base(o), type: "free" });
export const explain = (o: Lv<Omit<FreeExercise, "type">>): FreeExercise => ({ ...base(o), type: "explain" });
