import { LEVELS } from "./config";

export interface CompletionOptions {
  vocabulary?: { count: number; fast: boolean };
  task?: "grade" | "explain" | "examples" | "analysis" | "exercises" | "enrich";
  count?: number;
  fast?: boolean;
}

export function parseCompletionOptions(value: unknown): CompletionOptions {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Options de génération invalides.");
  const input=value as CompletionOptions;
  const vocabulary = input.vocabulary;
  if (vocabulary !== undefined && (!vocabulary || !Number.isInteger(vocabulary.count) || vocabulary.count < 1 || vocabulary.count > 2000 || typeof vocabulary.fast !== "boolean")) {
    throw new Error("Options du lot de vocabulaire invalides.");
  }
  if(input.task!==undefined&&!["grade","explain","examples","analysis","exercises","enrich"].includes(input.task))throw Error("Type de tâche IA inconnu.");
  if(input.count!==undefined&&(!Number.isInteger(input.count)||input.count<1||input.count>2000))throw Error("Quantité IA invalide.");
  if(input.fast!==undefined&&typeof input.fast!=="boolean")throw Error("Mode rapide invalide.");
  return { ...(vocabulary?{vocabulary:{count:vocabulary.count,fast:vocabulary.fast}}:{}),...(input.task?{task:input.task}:{}),...(input.count!==undefined?{count:input.count}:{}),...(input.fast!==undefined?{fast:input.fast}:{}) };
}

const text={type:"string"};
const texts={type:"array",items:text};
const object=(properties:Record<string,unknown>,required=Object.keys(properties))=>({type:"object",additionalProperties:false,properties,required});
export const MISTAKE_TYPES=["grammar","vocabulary","collocation","register","word-order","preposition","tense","spelling","false-friend","style"];
export const MISTAKE_CAUSES=["french-interference","false-friend","overgeneralisation","register-mismatch","unnatural-phrasing","carelessness","unknown"];
export const ANALYSIS_SKILLS=["grammar","vocabulary","collocations","idioms","register","precision","nuance","structure","paraphrase","reading","writing"];
const correction=object({original:text,corrected:text,explanation:text,example:text});
export function taskResponseSchema(options:CompletionOptions):Record<string,unknown>|undefined {
 if(options.vocabulary)return vocabularyResponseSchema(options.vocabulary.count);
 const count=options.count??1;
 switch(options.task){
  case "grade":return object({score:{type:"number",minimum:0,maximum:1},verdict:{type:"string",enum:["correct","close","partial","wrong"]},feedback:text,improved:text,corrections:{type:"array",items:correction},strengths:texts,nextStep:text});
  case "explain":return object({rule:text,analysis:text,examples:texts,takeaway:text});
  case "examples":return object({examples:{...texts,minItems:count,maxItems:count}});
  case "analysis":return object({levels:object(Object.fromEntries(ANALYSIS_SKILLS.map(s=>[s,{type:"string",enum:[...LEVELS]}])),[]),mistakes:{type:"array",items:object({wrong:text,correct:text,type:{type:"string",enum:MISTAKE_TYPES},cause:{type:"string",enum:MISTAKE_CAUSES},explanation:text})},strengths:texts,weaknesses:texts,summary:text});
  case "enrich":return object({items:{type:"array",minItems:count,maxItems:count,items:object({index:{type:"integer",minimum:0,maximum:count-1},translationFr:text,meaning:text,example:text,exampleFr:text,level:{type:"string",enum:[...LEVELS]}})}});
  case "exercises":return object({title:text,explanation:text,exercises:{type:"array",minItems:count,maxItems:count,items:object({type:{type:"string",enum:["cloze","mcq","free","explain","rewrite","translate","correct"]},instruction:text,prompt:text,explanation:text,level:{type:"string",enum:[...LEVELS]},answers:texts,model:text,rubric:texts,options:texts,answer:{type:"integer",minimum:0},compare:texts,optionNotes:texts,minWords:{type:"integer",minimum:1},maxWords:{type:"integer",minimum:1}},["type","instruction","prompt","explanation","level"])}});
 }
}

// Ollama constrains the structure and number of rows. The app still validates
// content and uniqueness: a schema cannot certify linguistic correctness.
export function vocabularyResponseSchema(count: number) {
  const text = { type: "string" };
  return {
    type: "object", additionalProperties: false, required: ["version", "items"],
    properties: {
      version: { type: "integer", const: 1 },
      items: {
        type: "array", minItems: count, maxItems: count,
        items: {
          type: "object", additionalProperties: false,
          required: ["kind", "text", "translationFr", "meaning", "example", "exampleFr"],
          properties: {
            kind: { type: "string", enum: ["word", "expression", "phrasal-verb", "idiom", "collocation"] },
            text: { type: "string", minLength: 1, maxLength: 300 },
            translationFr: { type: "string", minLength: 1 }, meaning: text,
            example: text, exampleFr: text, notes: text,
            level: { type: "string", enum: [...LEVELS] },
            register: { type: "string", enum: ["neutral", "casual", "professional", "formal", "academic", "literary"] },
            tags: { type: "array", items: text },
          },
        },
      },
    },
  };
}
