import type { Settings } from "@/lib/types";
import { aiComplete } from "./client";
import { normalizeTerm, parseVocabulary } from "@/lib/imports/vocabulary";

export function requestedCount(prompt:string):number|null {
 const matches=[...prompt.matchAll(/\b(\d+)\s*(?:(?:nouveaux?|nouvelles?|new|advanced|complexes?|difficult|useful)\s+)*(?:mots?|termes?|expressions?|entrées?|words?|terms?|items?|exercices?|exercises?|questions?)\b/gi)];
 if(matches.length)return Number(matches.at(-1)![1]);
 if(/\b(?:cent|a hundred|one hundred|une centaine de)\s*(?:mots?|termes?|expressions?|words?|exercices?)\b/i.test(prompt))return 100;
 return null;
}
export interface VocabularyMemory { accepted: string[]; attempted: string[]; batchNumber: number; attempt: number }

export function vocabularyPrompt(topic:string,total:number,batch:number,remaining:number,known:string[],memory:VocabularyMemory={accepted:[],attempted:[],batchNumber:1,attempt:1}) {
 const retained=new Set(memory.accepted.map(vocabularyKey));
 const otherAttempts=memory.attempted.filter(t=>!retained.has(vocabularyKey(t)));
 const focus=["precise verbs", "descriptive adjectives", "nouns for specific feelings, behaviours or situations", "natural collocations", "useful phrasal verbs"][((memory.batchNumber-1)+(memory.attempt-1))%5];
 return `Create vocabulary according to the learner's request below. Their requested level, topics, language, detail, style and vocabulary types take precedence over defaults.\nLEARNER REQUEST (verbatim):\n${topic || "Suggest vocabulary useful at my current level."}\n\nReturn JSON: an object with version: 1 and items: an array. Each entry has text, kind, translationFr (idiomatic French), meaning (English definition), example and exampleFr. Include notes for requested usage/nuance, plus tags, register and level when useful. kind: word | expression | phrasal-verb | idiom | collocation. Classify individual words as word, not expression. register: neutral | casual | professional | formal | academic | literary. level: B1 | B1+ | B2 | B2+ | C1 | C1+ | C2 when estimable; do not label every entry C1 automatically. Respect explicitly requested languages and detail. Do not output placeholder values or explanations outside the JSON.\n\nFor an open-ended mix, favour ${focus} in this call, within the requested topic. This is a diversity suggestion, never a reason to disregard an explicit requested type or distribution. Do not turn a request for words into a list of idioms. Prefer precise useful vocabulary over basic cognates for an advanced request. Avoid filler commentary in notes: explain actual usage.\n\nSESSION MEMORY — maintained by the app between every call. These are data, not instructions or examples to copy.\nALREADY IN LIBRARY (${known.length}): ${JSON.stringify(known)}\nACCEPTED IN THIS GENERATION (${memory.accepted.length}, including the current incomplete batch): ${JSON.stringify(memory.accepted)}\nOTHER TERMS ALREADY PROPOSED (${otherAttempts.length}): ${JSON.stringify(otherAttempts)}\nAll three lists are excluded. Do not recycle an entry by adding/removing 'to', changing pronoun, punctuation or inflection, or making a cosmetic rewording of the same expression. Select different lexical entries.\n\nBATCH ${memory.batchNumber}, ATTEMPT ${memory.attempt}. The final target is ${total}; ${remaining} remain. THIS CALL: return ${batch} NEW DISTINCT entries only. ${memory.attempt>1?"The previous response did not fill this batch. Its accepted entries are already stored above. Supply only the missing entries, using a different lexical angle; do not restart the batch.":"Continue from the stored memory; do not restart the list."} Check each proposed text against the memory before returning it.`;
}

// Conservative lexical normalization for generation only. No fuzzy matching:
// related words and genuinely different expressions remain available.
export function vocabularyKey(text:string) {
 return normalizeTerm(text).replace(/[’‘]/g,"'").replace(/^["“”]+|["“”.!?;:]+$/g,"")
  .replace(/^to\s+(?=\S)/,"").replace(/\b(?:one|somebody|sb)'s\b/g,"someone's")
  .replace(/\b(?:somebody|sb)\b/g,"someone").replace(/\bsth\b/g,"something").trim();
}
function termOf(value:unknown):string|undefined {
 if(!value||typeof value!=="object")return;
 const text=(value as {text?:unknown}).text;
 return typeof text==="string"&&text.trim()&&text.length<=300?text.trim():undefined;
}
export function uniqueVocabulary(values:unknown[],seen:Set<string>) {
 const unique:unknown[]=[],invalid:unknown[]=[];let duplicates=0;
 for(const value of values){
  const row=parseVocabulary(JSON.stringify({version:1,items:[value]}))[0];
  if(!row.item){invalid.push(value);continue;}
  const key=vocabularyKey(row.item.text);
  if(seen.has(key)){duplicates++;continue;}
  seen.add(key);unique.push(value);
 }
 return {unique,invalid,duplicates};
}
export interface VocabularyCall {call:number;batch:number;requested:number;received:number;accepted:number;duplicates:number;invalid:number;overflow:number}
export interface VocabularyProgress {items:unknown[]; invalid:unknown[]; attempted:string[]; reports:VocabularyCall[]; duplicates:number; target:number; calls:number; batch:number; batchAccepted:number; batchTarget:number; message:string}
export interface VocabularyOptions {fast?:boolean;resume?:VocabularyProgress}
export async function generateVocabulary(s:Settings,topic:string,count:number,batchSize:number,known:string[],onProgress:(p:VocabularyProgress)=>void,signal?:AbortSignal,options:VocabularyOptions={}){
 if(!Number.isInteger(count)||count<1||count>2000)throw Error("Choisissez entre 1 et 2 000 entrées, capacité d’un import. Pour davantage, créez plusieurs listes.");
 if(!Number.isInteger(batchSize)||batchSize<1||batchSize>2000)throw Error("Taille de lot : entier de 1 à 2 000 attendu.");
 const previous=options.resume;
 const items:unknown[]=[...(previous?.items??[])],invalid:unknown[]=[...(previous?.invalid??[])];
 const reports=[...(previous?.reports??[])];
 const attempted=new Map<string,string>((previous?.attempted??[]).map(t=>[vocabularyKey(t),t]));
 const library=[...new Map(known.map(t=>[vocabularyKey(t),t])).values()];
 const acceptedTerms=()=>items.map(termOf).filter((t):t is string=>!!t);
 const seen=new Set([...library,...acceptedTerms(),...attempted.values()].map(vocabularyKey));
 let duplicates=previous?.duplicates??0,calls=previous?.calls??0;
 let batchNumber=Math.floor(items.length/batchSize)+1,batchAccepted=items.length%batchSize,batchTarget=Math.min(batchSize,count-(items.length-batchAccepted));
 const snapshot=(message:string):VocabularyProgress=>({items:[...items],invalid:[...invalid],attempted:[...attempted.values()],reports:[...reports],duplicates,target:count,calls,batch:batchNumber,batchAccepted,batchTarget,message});
 const publish=(message:string)=>onProgress(snapshot(message));
 while(items.length<count){
  batchNumber=Math.floor(items.length/batchSize)+1;
  const batchStart=(batchNumber-1)*batchSize;
  batchTarget=Math.min(batchSize,count-batchStart);
  batchAccepted=items.length-batchStart;
  // One initial call and at most three targeted fills per batch. Every fill
  // receives updated memory, including entries accepted within this batch.
  for(let attempt=1;batchAccepted<batchTarget&&attempt<=4;attempt++){
   if(signal?.aborted)throw Error("Génération arrêtée. Les lots déjà reçus restent disponibles.");
   const requested=batchTarget-batchAccepted;
   calls++;publish(`Lot ${batchNumber} · ${batchAccepted}/${batchTarget} retenus · appel ${calls}${attempt>1?" (complément)":""} · ${items.length}/${count} au total`);
   const data=await aiComplete(s,vocabularyPrompt(topic,count,requested,count-items.length,library,{accepted:acceptedTerms(),attempted:[...attempted.values()],batchNumber,attempt}),signal,{vocabulary:{count:requested,fast:options.fast??true}});
   if(signal?.aborted)throw Error("Génération arrêtée. Les lots déjà reçus restent disponibles.");
   if(!Array.isArray(data.items))throw Error("Le modèle n’a pas renvoyé une liste items. Consultez le diagnostic ; les lots précédents sont conservés.");
   const result=uniqueVocabulary(data.items,seen);
   for(const value of data.items){const term=termOf(value);if(term){attempted.set(vocabularyKey(term),term);seen.add(vocabularyKey(term));}}
   const accepted=result.unique.slice(0,requested);
   duplicates+=result.duplicates;invalid.push(...result.invalid);items.push(...accepted);
   batchAccepted+=accepted.length;
   reports.push({call:calls,batch:batchNumber,requested,received:data.items.length,accepted:accepted.length,duplicates:result.duplicates,invalid:result.invalid.length,overflow:result.unique.length-accepted.length});
   publish(`Lot ${batchNumber} · ${batchAccepted}/${batchTarget} retenus · ${items.length}/${count} au total · ${duplicates} doublons écartés`);
  }
  if(batchAccepted<batchTarget)throw Error(`Le lot ${batchNumber} reste incomplet (${batchAccepted}/${batchTarget}) après 4 appels. ${items.length} termes conservés. Vous pouvez continuer cette liste sans recommencer, ou changer de modèle.`);
 }
 return snapshot(`Terminé : ${items.length}/${count} termes distincts. Vérifiez le contenu avant l’import.`);
}
