import assert from "node:assert/strict";
import { configuredProvider, validateGrade } from "../src/lib/ai/provider";
import { resolveStudioMode } from "../src/lib/ai/intent";
import { DEFAULT_SETTINGS } from "../src/lib/db/repo";
import { grade, needsAIReview } from "../src/lib/engine/grader";
import { generateUnit, validateUnit } from "../src/lib/ai/generation";
import { enrichVocabulary } from "../src/lib/ai/enrich";
import { completeDetailed, CompletionError, completionPayload } from "../src/lib/ai/server";
import { clearTraces, traceSnapshot } from "../src/lib/ai/diagnostics";
import type { Exercise } from "../src/lib/types";

export async function checkAIIntegration(){
 const realFetch=globalThis.fetch;
 const settings={...DEFAULT_SETTINGS,aiProvider:"ollama" as const,aiModel:"qwen3:8b"};
 const ai=configuredProvider(settings);
 const ex:Exercise={id:"test",type:"free",instruction:"Write about your commute.",prompt:"Use a natural sentence.",model:"I went to work by train.",rubric:["Clear meaning","Correct tense"],skills:["writing"],tags:[],difficulty:65};
 const answer="I go to work yesterday.";
 const good={score:0.6,verdict:"partial",feedback:"Le sens est clair, mais yesterday situe l’action dans le passé.",improved:"I went to work yesterday.",strengths:["Le contexte est compréhensible."],corrections:[{original:"go",corrected:"went",explanation:"Yesterday situe une action terminée : utilisez le prétérit. Go est irrégulier : went.",example:"I went home early last night."}],nextStep:"Racontez une autre action terminée au prétérit."};
 let calls=0;const requests:Record<string,unknown>[]=[];
 function mock(make:(body:Record<string,unknown>,call:number)=>unknown){
  calls=0;requests.length=0;
  globalThis.fetch=async(_url,init)=>{const body=JSON.parse(String(init?.body));
   if(body.action==="preview")return Response.json({request:{body:completionPayload({mode:"ollama",baseUrl:"http://localhost:11434",model:"qwen3:8b"},body.prompt,body.context,body.options)}});
   calls++;requests.push(body);const result=make(body,calls);return result instanceof Response?result:Response.json({result,trace:{raw:JSON.stringify(result)}});
  };
 }
 try{
  assert.equal(resolveStudioMode("Je veux enrichir mon vocabulaire. Génère au total 100 mots et expressions distincts.","exercises"),"vocabulary");
  assert.equal(resolveStudioMode("Crée 10 exercices sur les mots difficiles","vocabulary"),"exercises");
  assert.equal(resolveStudioMode("Write a text of 100 words about music","exercises"),"exercises");
  assert.equal(grade(ex,"  ").score,0);assert.notEqual(grade(ex,"  ").verdict,"self");
  assert.equal(needsAIReview(ex,"",grade(ex,"")),false);
  const rewrite:Exercise={...ex,type:"rewrite",answers:["I went to work yesterday."],model:"I went to work yesterday."};
  assert.equal(needsAIReview(rewrite,answer,grade(rewrite,answer)),true);
  mock(()=>good);await assert.rejects(ai.gradeProduction(ex,"  "),/Aucune réponse/);assert.equal(calls,0);
  clearTraces();mock((_b,n)=>n===1?{score:"bad"}:good);
  const graded=await ai.gradeProduction(ex,answer);
  assert.equal(calls,2);assert.equal(graded.corrections?.[0].original,"go");
  assert.ok(String(requests[0].prompt).includes(answer));assert.equal((requests[0].options as {task:string}).task,"grade");
  assert.equal(traceSnapshot()[0].status,"success");assert.equal(traceSnapshot()[1].status,"error");
  assert.throws(()=>validateGrade({...good,corrections:[{...good.corrections[0],original:"I was sleeping"}]},answer,ex),/réellement/);
  mock(()=>({score:"bad"}));await assert.rejects(ai.gradeProduction(ex,answer),/incomplète/);assert.equal(calls,2);
  mock(()=>Response.json({error:"Serveur inaccessible",code:"provider_error"},{status:400}));await assert.rejects(ai.gradeProduction(ex,answer),/inaccessible/);assert.equal(calls,1);
  mock(()=>good);const cancel=new AbortController();cancel.abort();await assert.rejects(ai.gradeProduction(ex,answer,cancel.signal),/arrêtée/);assert.equal(calls,0);
  mock(()=>({rule:"Prétérit",analysis:"Le repère yesterday exige un temps passé.",examples:["I went home.","I go home every day."],takeaway:"Yesterday → passé."}));assert.equal((await ai.explainExercise(ex,answer,grade(ex,answer))).examples.length,2);
  mock(()=>({examples:["I felt wary of the offer."]}));assert.equal((await ai.generateExamples({text:"wary",meaning:"cautious",register:"neutral"} as never,1)).length,1);
  mock(()=>({levels:{grammar:"B2"},mistakes:[{wrong:"go",correct:"went",type:"tense",cause:"unknown",explanation:"Passé requis."}],strengths:["Sens clair"],weaknesses:["Temps"],summary:"Travaillez le prétérit."}));assert.equal((await ai.analyzeTest(answer)).mistakes.length,1);
  mock(()=>({items:[{index:1,translationFr:"prudent",meaning:"cautious",example:"I was wary.",exampleFr:"Je me méfiais.",level:"C1"},{index:0,translationFr:"traduction à ignorer",meaning:"economical",example:"I am frugal.",exampleFr:"Je suis économe.",level:"C1"}]}));
  const filled=await enrichVocabulary(settings,[{text:"frugal",translationFr:"économe",notes:"Note personnelle"},{text:"wary"}]);
  assert.equal(filled[0].translationFr,"économe");assert.equal(filled[0].notes,"Note personnelle");assert.equal(filled[1].text,"wary");assert.equal(filled[1].meaning,"cautious");
  assert.throws(()=>validateUnit({title:"T",explanation:"E",exercises:[{prompt:"P",instruction:"I",exercises:[]}]},settings),/imbriqués/);
  assert.throws(()=>validateUnit({title:"T",explanation:"E",exercises:[{type:"mcq",prompt:"P",instruction:"I",options:["yes","yes"],answer:0}]},settings),/invalide/);
  let ordinal=0;const amounts:number[]=[];
  mock((body,n)=>{const count=(body.options as {count:number}).count;amounts.push(count);
   if(n===1)return Response.json({error:"Réponse coupée",code:"output_truncated"},{status:400});
   return {title:"Past tense",explanation:"A lesson",exercises:Array.from({length:count},()=>({type:"cloze",prompt:`Yesterday ${++ordinal}: I ___ home.`,instruction:"Complete",explanation:"Yesterday requires the past tense.",answers:["went"],level:"B2"}))};
  });
  const unit=await generateUnit(settings,"5 exercices au passé","exercises",5);
  assert.equal(unit.exercises.length,5);assert.deepEqual(amounts,[5,2,2,1]);
  globalThis.fetch=async()=>Response.json({message:{content:'{"exercises":[{"exercises":['},done_reason:"length",eval_count:8192});
  await assert.rejects(completeDetailed({mode:"ollama",baseUrl:"http://localhost:11434",model:"qwen3:8b"},"test",{}),(e:unknown)=>e instanceof CompletionError&&e.code==="output_truncated"&&String(e.trace.raw).includes('"exercises"'));
  console.log("AI integration checks passed: intent routing, blank/skip semantics, written review, detailed feedback, bounded format retry, no retry on transport/truncation, diagnostics, examples, test analysis, enrichment preservation, flat exercise validation, adaptive batch size.");
 }finally{globalThis.fetch=realFetch;}
}
