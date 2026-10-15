import type { Settings } from "@/lib/types";
import { parseVocabulary } from "@/lib/imports/vocabulary";
import { aiValidated } from "./client";
export async function enrichVocabulary(s:Settings,values:unknown[],signal?:AbortSignal,onProgress?:(done:number)=>void){
 if(!Array.isArray(values)||!values.length||values.length>2000)throw Error("Enrichissement : 1 à 2 000 entrées attendues.");
 const originals=values.map(v=>{if(!v||typeof v!=="object"||typeof (v as {text?:unknown}).text!=="string"||!(v as {text:string}).text.trim())throw Error("Chaque entrée doit contenir un terme anglais.");return v as Record<string,unknown>;});
 const all:Record<string,unknown>[]=[];
 for(let offset=0;offset<originals.length;offset+=5){
  const batch=originals.slice(offset,offset+5);onProgress?.(offset);
  const filled=await aiValidated(s,`Fill missing vocabulary information for these entries: ${JSON.stringify(batch.map((entry,index)=>({index,...entry})))}. Return an items array, one entry per input index (zero-based within this call), with index, translationFr (natural French), meaning (English definition), example, exampleFr and level. Do not rename or replace the source term. Use the source meaning and register. Existing fields are authoritative.`,{task:"enrich",count:batch.length},d=>{
   if(!Array.isArray(d.items)||d.items.length!==batch.length)throw Error("Lot enrichi incomplet.");
   const byIndex=new Map<number,Record<string,unknown>>();
   for(const row of d.items){if(!row||typeof row!=="object"||!Number.isInteger(row.index)||row.index<0||row.index>=batch.length||byIndex.has(row.index))throw Error("Indices d’enrichissement invalides.");byIndex.set(row.index,row);}
   const merged=batch.map((original,index)=>{
    const generated=byIndex.get(index)!;const additions:Record<string,unknown>={};
    for(const key of ["translationFr","meaning","example","exampleFr","level"]){if(typeof generated[key]!=="string")throw Error(`Champ enrichi invalide : ${key}.`);additions[key]=generated[key];}
    return {...additions,...Object.fromEntries(Object.entries(original).filter(([,v])=>v!==""&&v!==null&&v!==undefined&&(!Array.isArray(v)||v.length)))};
   });
   if(parseVocabulary(JSON.stringify({version:1,items:merged})).some(r=>r.errors.length))throw Error("Champs enrichis invalides.");
   return merged;
  },signal);
  all.push(...filled);
 }
 onProgress?.(all.length);return all;
}
