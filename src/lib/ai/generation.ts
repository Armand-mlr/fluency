import { aiValidated, AIRequestError, strings } from "./client";
import type { Exercise, Settings, StudyUnit } from "@/lib/types";
import { LEVELS } from "./config";
import type { CEFR } from "@/lib/types";
import { LEVEL_DIFFICULTY } from "@/lib/engine/levels";
export function validateUnit(data:Record<string,unknown>,settings:Settings):Omit<StudyUnit,"id"|"createdAt"> {
 if(typeof data.title!=="string"||!data.title.trim()||typeof data.explanation!=="string"||!Array.isArray(data.exercises)||!data.exercises.length)throw Error("Le contenu généré ne respecte pas le format attendu. La réponse brute reste dans le diagnostic.");
 const exercises:Exercise[]=data.exercises.map((e:unknown)=>{
  if(!e||typeof e!=="object")throw Error("Exercice IA invalide.");const x=e as Record<string,unknown>;
  if("exercises" in x)throw Error("Exercices imbriqués interdits : chaque entrée doit être un exercice complet, sans sous-liste exercises.");
  if(typeof x.prompt!=="string"||!x.prompt.trim()||typeof x.instruction!=="string"||!x.instruction.trim())throw Error("Exercice invalide : consigne et texte requis.");
  const type=x.type??"cloze";
  const base={id:`ai:${crypto.randomUUID()}`,skills:[type==="free"?"writing":"grammar"] as Exercise["skills"],difficulty:LEVEL_DIFFICULTY[LEVELS.includes(x.level as CEFR)?x.level as CEFR:settings.currentLevel??"B2"],tags:["ai-studio"],instruction:x.instruction,prompt:x.prompt,explanation:typeof x.explanation==="string"?x.explanation:"",compare:strings(x.compare)?x.compare:undefined,origin:"ai" as const,estSeconds:type==="free"?150:40};
  if(type==="mcq"&&strings(x.options)&&x.options.length>=2&&x.options.every(a=>a.trim())&&new Set(x.options.map(a=>a.trim().toLowerCase())).size===x.options.length&&Number.isInteger(x.answer)&&Number(x.answer)>=0&&Number(x.answer)<x.options.length)return {...base,type,options:x.options,answer:Number(x.answer),optionNotes:strings(x.optionNotes)?x.optionNotes:undefined};
  if((type==="free"||type==="explain")&&typeof x.model==="string"&&x.model.trim()&&strings(x.rubric)&&x.rubric.length)return {...base,type,model:x.model,rubric:x.rubric,minWords:typeof x.minWords==="number"?x.minWords:undefined,maxWords:typeof x.maxWords==="number"?x.maxWords:undefined};
  if(strings(x.answers)&&x.answers.length&&x.answers.every(a=>a.trim())){
   if(type==="cloze"&&x.prompt.includes("___"))return {...base,type,answers:x.answers};
   if(["rewrite","translate","correct"].includes(String(type)))return {...base,type:type as "rewrite"|"translate"|"correct",answers:x.answers,model:typeof x.model==="string"?x.model:x.answers[0]};
  }
  throw Error("Exercice invalide : format ou réponse incompatible avec le lecteur. Consultez le diagnostic.");
 });
 return {title:data.title,explanation:data.explanation,exercises};
}
export async function generateUnit(s:Settings,topic:string,mode:"exercises"|"grammar",count=5,signal?:AbortSignal,onProgress?:(done:number,unit:Omit<StudyUnit,"id"|"createdAt">)=>void,fast=true){
 if(!Number.isInteger(count)||count<1||count>2000)throw Error("Quantité d’exercices invalide.");
 let unit:Omit<StudyUnit,"id"|"createdAt">|null=null;
 let limit=5,stalls=0;const seen=new Set<string>();
 while((unit?.exercises.length??0)<count){
  if(signal?.aborted)throw Error("Génération arrêtée. Les exercices reçus restent disponibles.");
  const done=unit?.exercises.length??0;const batch=Math.min(limit,count-done);
  const prompt=`Follow the learner's explicit request over profile defaults. REQUEST: ${topic || "Practice my weak areas."}\nCreate ${mode==="grammar"?"a grammar explanation and practice":"practice exercises"}. The total is ${count} exercises; THIS CALL: ${batch} exercises only (${done} already received). Return title, explanation and a FLAT exercises array; never put an exercises field inside an exercise. Each exercise must have its own instruction, prompt, type, level and an explanation that teaches the rule and applies it to the sentence. Include contrasting examples where useful. Types: cloze (prompt with ___, answers:string[]); mcq (distinct options:string[], answer:zero-based integer, optionNotes:string[] explaining distractors); free/explain (model:string, rubric:string[], minWords/maxWords when requested); rewrite/translate/correct (answers:string[], model:string). For closed questions, verify the answer fits the prompt, is unambiguous and preserves meaning. Previous prompts already accepted, to exclude: ${JSON.stringify([...seen])}. Do not repeat the lesson introduction on later batches.`;
  let next:Omit<StudyUnit,"id"|"createdAt">;
  try{next=await aiValidated(s,prompt,{task:"exercises",count:batch,fast},d=>{const parsed=validateUnit(d,s);if(parsed.exercises.length!==batch)throw Error(`Le lot doit contenir ${batch} exercices complets.`);return parsed;},signal);}
  catch(e){if(e instanceof AIRequestError&&e.code==="output_truncated"&&batch>1){limit=Math.max(1,Math.floor(batch/2));continue;}throw e;}
  if(!unit)unit={title:next.title,explanation:next.explanation,exercises:[]};else if(mode==="grammar"&&next.explanation&&next.explanation!==unit.explanation)unit.explanation+="\n\n"+next.explanation;
  const fresh=next.exercises.filter(e=>{const key=("prompt" in e?e.prompt:"").trim().toLowerCase();if(seen.has(key))return false;seen.add(key);return true;});
  unit.exercises.push(...fresh.slice(0,count-done));onProgress?.(unit.exercises.length,{...unit,exercises:[...unit.exercises]});
  stalls=fresh.length?0:stalls+1;if(stalls>=2)throw Error("Le modèle répète les mêmes exercices. Les exercices reçus restent dans l’aperçu.");
 }
 return unit!;
}
