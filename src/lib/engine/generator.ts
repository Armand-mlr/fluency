import type { Card, Exercise, Mistake, SkillId, VocabItem } from "@/lib/types";
import { LEVEL_DIFFICULTY } from "./levels";
import { escapeRegex, pick, shuffle } from "@/lib/util";

/**
 * Turns YOUR data (vocabulary items, mistakes) into exercises.
 * The same item is practised through different formats depending on the
 * facet being reviewed, and leeches get a random format each time so you
 * don't just memorise the shape of one exercise.
 */

const FILLER = new Set(["to", "sb", "sth", "someone", "something", "one's", "oneself", "(sth)", "(sb)"]);

function coreWords(text: string) {
  return text
    .replace(/[()]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !FILLER.has(w.toLowerCase()));
}

/** Answers accepted when you have to produce the item. */
export function itemAnswers(item: VocabItem): string[] {
  const t = item.text.trim();
  const set = new Set([t, t.replace(/^to\s+/i, ""), t.replace(/\s*\(.*?\)\s*/g, " ").trim()]);
  return [...set].filter(Boolean);
}

/**
 * Find the item inside its example sentence, allowing for conjugation
 * ("to come across" matches "came across").
 */
export function locateInExample(item: VocabItem): string | null {
  if (!item.example) return null;
  const words = coreWords(item.text);
  if (!words.length) return null;
  const stem = (w: string) => escapeRegex(w.slice(0, Math.max(3, w.length - 2))) + "\\w*";
  const between = "(?:\\s+\\w+){0,3}?\\s+"; // allow an object in the middle: "put it off"
  const strict = new RegExp("\\b" + words.map(stem).join(between) + "\\b", "i");
  let m = item.example.match(strict);
  if (!m && words.length > 1) {
    // irregular verb: first word unknown form, rest must match
    const loose = new RegExp("\\b" + escapeRegex(words[0][0]) + "\\w*" + between + words.slice(1).map(stem).join(between) + "\\b", "i");
    m = item.example.match(loose);
  }
  return m ? m[0] : null;
}

function skillsFor(item: VocabItem): SkillId[] {
  const s: SkillId[] = ["vocabulary"];
  if (item.kind === "collocation") s.push("collocations");
  if (item.kind === "idiom" || item.kind === "phrasal-verb") s.push("idioms");
  if (item.kind === "structure") s.push("structure");
  if (item.register === "formal" || item.register === "academic" || item.register === "casual") s.push("register");
  return s;
}

export function exerciseForItem(item: VocabItem, card: Card, pool: VocabItem[]): Exercise {
  const base = {
    id: `gen:${card.id}`,
    skills: skillsFor(item),
    difficulty: item.level ? LEVEL_DIFFICULTY[item.level] : 60,
    tags: [item.kind, ...item.tags],
    itemId: item.id,
    facet: card.facet,
    origin: "generated" as const,
    explanation: [`${item.text} : ${item.meaning || item.translationFr || item.text}.`,item.translationFr?`Sens en français : ${item.translationFr}.`:"",item.register!=="neutral"?`Registre : ${item.register}.`:"",item.notes?`Usage et nuance : ${item.notes}`:"",item.example?`Exemple : ${item.example}`:"",item.exampleFr?`Traduction : ${item.exampleFr}`:""].filter(Boolean).join("\n\n"),
    compare: item.example ? [item.example] : undefined,
  };

  // leeches: vary the format to avoid format-specific memorisation
  const facet = card.leech ? pick(["recognize", "produce", "use"] as const) : card.facet;
  const others = shuffle(pool.filter((p) => p.id !== item.id && p.meaning && p.meaning !== (item.meaning || item.translationFr || item.text)));

  if (facet === "recognize") {
    if (others.length >= 3) {
      const sameKind = others.filter((o) => o.kind === item.kind);
      const distractors = [...sameKind, ...others.filter((o) => o.kind !== item.kind)].slice(0, 3);
      const options = shuffle([(item.meaning || item.translationFr || item.text), ...distractors.map((d) => d.meaning)]);
      return {
        ...base,
        type: "mcq",
        instruction: "What does the expression in bold mean here?",
        prompt: item.example
          ? item.example.replace(locateInExample(item) ?? item.text, (m) => `**${m}**`)
          : `**${item.text}**`,
        options,
        answer: options.indexOf((item.meaning || item.translationFr || item.text)),
        estSeconds: 20,
      };
    }
    return {
      ...base,
      type: "explain",
      instruction: "Explain in your own words (English) what this means, then check.",
      prompt: `**${item.text}**${item.example ? `\n\n“${item.example}”` : ""}`,
      model: (item.meaning || item.translationFr || item.text) + (item.translationFr ? `  (FR: ${item.translationFr})` : ""),
      rubric: ["Core meaning is right", "You could use it in a sentence"],
      estSeconds: 35,
    };
  }

  if (facet === "produce") {
    const first = item.text.replace(/^to\s+/i, "")[0];
    const cue = item.translationFr
      ? `French: « ${item.translationFr} »\nMeaning: ${(item.meaning || item.translationFr || item.text)}`
      : `Meaning: ${(item.meaning || item.translationFr || item.text)}`;
    return {
      ...base,
      type: "cloze",
      difficulty: base.difficulty + 4, // production is harder than recognition
      instruction: "Retrieve the English expression.",
      prompt: `${cue}\n\n___`,
      answers: itemAnswers(item),
      hint: `Starts with “${first}”, ${coreWords(item.text).length} word(s)`,
      estSeconds: 25,
    };
  }

  // facet "use"
  const located = locateInExample(item);
  if (located && item.example && (card.reps % 2 === 0 || card.leech)) {
    return {
      ...base,
      type: "cloze",
      difficulty: base.difficulty + 2,
      instruction: "Complete with the right expression, in the right form.",
      prompt: item.example.replace(located, "___") + (item.translationFr ? `\n\n(≈ ${item.translationFr})` : ""),
      answers: [located],
      hint: `Meaning: ${(item.meaning || item.translationFr || item.text)}`,
      estSeconds: 25,
    };
  }
  const regHint =
    item.register === "neutral" ? "" : ` The context should suit a ${item.register} register.`;
  return {
    ...base,
    type: "free",
    skills: [...base.skills, "writing"],
    difficulty: base.difficulty + 6,
    instruction: `Write one sentence of your own using “${item.text}”.${regHint}`,
    prompt: `Use a realistic context (work, university, tech, news, relationships...).\nMeaning: ${(item.meaning || item.translationFr || item.text)}`,
    model: item.example ?? `(No example saved for this item.)`,
    rubric: ["Meaning is used correctly", "The grammar around it is right", "The sentence sounds natural in its context"],
    minWords: 6,
    estSeconds: 60,
  };
}

export function exerciseForMistake(m: Mistake, card: Card): Exercise {
  const skillFor: Record<string, SkillId[]> = {
    grammar: ["grammar"],
    tense: ["grammar"],
    "word-order": ["grammar", "structure"],
    preposition: ["grammar", "collocations"],
    vocabulary: ["vocabulary", "precision"],
    "false-friend": ["vocabulary", "precision"],
    collocation: ["collocations"],
    register: ["register"],
    spelling: ["vocabulary"],
    style: ["writing", "register"],
  };
  const base = {
    id: `gen:${card.id}:${card.reps}`,
    skills: skillFor[m.type] ?? ["grammar"],
    difficulty: 58,
    tags: ["my-mistake", m.type, m.cause],
    mistakeId: m.id,
    facet: "fix" as const,
    origin: "generated" as const,
    explanation: m.explanation,
    compare: [`✗ ${m.wrong}`, `✓ ${m.correct}`],
  };
  const variants: Exercise[] = [
    {
      ...base,
      type: "correct",
      instruction: "This is one of YOUR recurring mistakes. Rewrite the sentence correctly.",
      prompt: m.wrong,
      answers: [m.correct],
      model: m.correct,
      estSeconds: 30,
    },
  ];
  const opts = shuffle([m.wrong, m.correct]);
  variants.push({
    ...base,
    type: "mcq",
    instruction: "Which one would a fluent speaker actually say?",
    prompt: "Pick the natural version.",
    options: opts,
    answer: opts.indexOf(m.correct),
    estSeconds: 12,
  });
  if (m.frenchHint) {
    variants.push({
      ...base,
      type: "translate",
      difficulty: 62,
      instruction: "Translate into natural English (watch the trap).",
      prompt: m.frenchHint,
      answers: [m.correct],
      model: m.correct,
      estSeconds: 35,
    });
  }
  // early on: recognition; later: production. Leeches: anything.
  if (card.leech) return pick(variants);
  if (card.reps === 0 && variants.length > 1) return variants[1];
  return variants.filter((v) => v.type !== "mcq")[card.reps % Math.max(1, variants.length - 1)] ?? variants[0];
}
