import type { Settings } from "@/lib/types";
import { setTrace, type AITrace } from "./diagnostics";
import type { CompletionOptions } from "./completion-options";
export class AIRequestError extends Error { constructor(message:string,public trace?:Partial<AITrace>,public code="provider_error"){super(message);} }
export async function aiRequest<T>(body:unknown,signal?:AbortSignal):Promise<T>{
 let response;
 try{response=await fetch("/api/ai",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.any([AbortSignal.timeout(1_810_000),...(signal?[signal]:[])])});}
 catch{throw new AIRequestError(signal?.aborted?"Génération arrêtée.":"Serveur local inaccessible ou délai dépassé. Réessayez.");}
 let data;try{data=await response.json();}catch{throw new AIRequestError("Le serveur de l’application n’a pas renvoyé de JSON. Vérifiez le terminal Fluency puis réessayez.");}
 if(!response.ok||data.error)throw new AIRequestError(data.error||"Erreur IA.",data.trace,data.code);
 return data as T;
}
export async function aiComplete(settings:Settings,prompt:string,signal?:AbortSignal,options:CompletionOptions={}):Promise<Record<string,unknown>>{
 return aiValidated(settings,prompt,options,d=>d,signal);
}
export async function aiValidated<T>(settings:Settings,prompt:string,options:CompletionOptions,validate:(data:Record<string,unknown>)=>T,signal?:AbortSignal):Promise<T>{
 const {db}=await import("@/lib/db/schema");
 const mistakes=(await db.mistakes.orderBy("lastSeen").reverse().limit(8).toArray()).map(m=>({wrong:m.wrong,correct:m.correct,explanation:m.explanation}));
 const context={name:settings.name,currentLevel:settings.currentLevel,targetLevel:settings.targetLevel,goals:settings.goals,interests:settings.interests,mistakes};
 let lastError:Error|undefined;
 for(let attempt=0;attempt<2;attempt++){
 if(signal?.aborted)throw new AIRequestError("Génération arrêtée.");
 const currentPrompt=attempt?`${prompt}\n\nFORMAT RETRY: The previous response could not be used: ${lastError?.message}. Generate a fresh complete JSON object matching the response schema. Keep arrays flat; no recursive exercises, markdown or commentary. This is the final automatic attempt.`:prompt;
 const id=crypto.randomUUID(),startedAt=Date.now();let request:unknown={prompt:currentPrompt,context,options};
 let trace:Partial<AITrace>={};
 setTrace({id,startedAt,request,status:"pending"});
 try{
  const preview=await aiRequest<{request:unknown}>({action:"preview",prompt:currentPrompt,context,options},signal);request=preview.request;setTrace({id,startedAt,request,status:"pending"});
  const response=await aiRequest<{result:Record<string,unknown>;trace:Partial<AITrace>}>({action:"complete",prompt:currentPrompt,context,options},signal);trace=response.trace;
  if(signal?.aborted)throw new AIRequestError("Génération arrêtée.");
  let result:T;try{result=validate(response.result);}catch(e){throw new AIRequestError((e as Error).message,trace,"invalid_shape");}
  setTrace({...trace,request:trace.request??request,id,startedAt,status:"success"});return result;
 }catch(e){
  lastError=e as Error;
  setTrace({id,startedAt,request,elapsedMs:Date.now()-startedAt,...trace,...(e instanceof AIRequestError?e.trace:{}),status:"error",error:lastError.message});
  // Do not repeat timeouts, authentication failures, cancellations, or an
  // exhausted output budget with identical parameters.
  if(attempt||signal?.aborted||!(e instanceof AIRequestError)||!["invalid_json","invalid_shape"].includes(e.code))throw e;
 }
 }
 throw lastError??new Error("Erreur IA.");
}
export function strings(value:unknown,max=100):value is string[]{return Array.isArray(value)&&value.length<=max&&value.every(s=>typeof s==="string"&&s.length<8000);}
