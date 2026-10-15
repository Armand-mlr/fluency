import "fake-indexeddb/auto";
import { checkAIIntegration } from "./check-ai-integration";
import { generateVocabulary, requestedCount, uniqueVocabulary, vocabularyPrompt, vocabularyKey, type VocabularyProgress } from "../src/lib/ai/vocabulary";
import { parseCompletionOptions } from "../src/lib/ai/completion-options";
import { parseModelJson } from "../src/lib/ai/json";
import assert from "node:assert/strict";
import { parseVocabulary, normalizeTerm, VOCAB_EXAMPLE } from "../src/lib/imports/vocabulary";
import { parseProfile, exportProfile, PROFILE_EXAMPLE } from "../src/lib/imports/profile";
import { db } from "../src/lib/db/schema";
import { ensureSeeded, importVocabulary, exportAll, importAll, updateSettings, DEFAULT_SETTINGS } from "../src/lib/db/repo";
import { validateUnit } from "../src/lib/ai/generation";
import { completionPayload, completeDetailed, validateConfig, complete, models } from "../src/lib/ai/server";
import { getProvider } from "../src/lib/ai/provider";

async function main() {
 await ensureSeeded();
 assert.equal(getProvider(DEFAULT_SETTINGS), null);
 assert.throws(()=>parseVocabulary("not JSON"),/JSON invalide/);
 assert.throws(()=>parseVocabulary('{"version":2,"items":[]}'),/Format attendu/);
 assert.throws(()=>parseVocabulary('{"version":1,"items":[]}'),/entre 1/);
 const incomplete=parseVocabulary(JSON.stringify({version:1,items:[{text:"hello"},{text:4,translationFr:"bonjour"},{text:"hello",translationFr:"bonjour",tags:[2]},{text:"hello",translationFr:"bonjour",level:"A9"}]}));
 assert.equal(incomplete.filter(r=>r.errors.length).length,4);
 const rows=parseVocabulary(JSON.stringify(VOCAB_EXAMPLE));
 assert.equal(rows[1].item!.meaning,"");assert.equal(rows[1].item!.level,"");
 assert.equal(normalizeTerm("  Thoughtful   "),"thoughtful");
 const make=(items:unknown[])=>parseVocabulary(JSON.stringify({version:1,items})).map(r=>r.item!);
 const input=make([{kind:"expression",text:" Unique   phrase ",translationFr:"expression",level:"C1",register:"formal"},{text:"unique phrase",translationFr:"doublon"}]);
 const before=await db.items.count();
 assert.deepEqual(await importVocabulary(input,"skip"),{added:1,updated:0,ignored:1});
 assert.equal(await db.items.count(),before+1);
 const item=(await db.items.toArray()).find(i=>i.text==="Unique phrase")!;
 const cards=await db.cards.where("refId").equals(item.id).toArray().catch(()=>db.cards.filter(c=>c.refId===item.id).toArray());
 const stableCards=JSON.stringify(cards);
 assert.deepEqual(await importVocabulary(make([{text:"unique phrase",translationFr:"updated"}]),"update"),{added:0,updated:1,ignored:0});
 const updated=await db.items.get(item.id);
 assert.equal(updated!.level,"C1");assert.equal(updated!.kind,"expression");assert.equal(updated!.register,"formal");assert.equal(updated!.translationFr,"updated");
 assert.equal(JSON.stringify(await db.cards.filter(c=>c.refId===item.id).toArray()),stableCards);
 // Failure after the first write must roll the entire transaction back.
 const originalPut=db.items.put.bind(db.items);let calls=0;
 db.items.put=((...args:Parameters<typeof db.items.put>)=>{if(++calls===2)throw Error("injected write failure");return originalPut(...args);}) as typeof db.items.put;
 await assert.rejects(importVocabulary(make([{text:"rollback one",meaning:"test"},{text:"rollback two",meaning:"test"}]),"skip"),/injected/);
 db.items.put=originalPut;
 assert.equal((await db.items.toArray()).filter(i=>i.text.startsWith("rollback")).length,0);
 const profile=parseProfile(JSON.stringify({...PROFILE_EXAMPLE,profile:{...PROFILE_EXAMPLE.profile,aiKey:"do-not-import"}}));
 assert.equal(profile.aiKey,undefined);assert.throws(()=>parseProfile(JSON.stringify({...PROFILE_EXAMPLE,profile:{...PROFILE_EXAMPLE.profile,currentLevel:"A9"}})),/Niveau invalide/);
 await updateSettings(profile);db.close();await db.open();assert.equal((await db.settings.get("settings"))!.name,"Alex");
 assert.equal(JSON.stringify(exportProfile({...DEFAULT_SETTINGS,aiKey:"secret"})).includes("secret"),false);
 const backup=await exportAll();assert.equal(JSON.stringify(backup).includes("aiKey"),false);
 const count=await db.items.count();await assert.rejects(importAll({...backup,items:[{bad:"data"}]}),/Invalid backup/);assert.equal(await db.items.count(),count);
 await importAll(backup);assert.equal(await db.items.count(),count);
 assert.throws(()=>validateUnit({title:"bad",explanation:"",exercises:[{prompt:"no blank"}]},DEFAULT_SETTINGS),/invalide/);
 const unit=validateUnit({title:"Tenses",explanation:"Test",exercises:[{instruction:"Complétez",prompt:"I ___ here.",answers:["work"],explanation:"Present simple"}]},DEFAULT_SETTINGS);assert.equal(unit.exercises[0].type,"cloze");
 assert.throws(()=>validateConfig({mode:"ollama",baseUrl:"https://external.example",model:"qwen3:8b"}),/local/);
 assert.throws(()=>validateConfig({mode:"ollama",baseUrl:"http://localhost:11434",model:"model-cloud"}),/local/);
 assert.throws(()=>validateConfig({mode:"openai",baseUrl:"http://external.example/v1",model:"x"}),/HTTPS/);
 await assert.rejects(complete({mode:"none",baseUrl:"",model:""},"test",{}),/non configurée/);
 const realFetch=globalThis.fetch;const config={mode:"ollama" as const,baseUrl:"http://localhost:11434",model:"qwen3:8b"};
 globalThis.fetch=async()=>{throw new TypeError("fetch failed");};await assert.rejects(models(config),/inaccessible/);
 globalThis.fetch=async()=>new Response("",{status:404});await assert.rejects(complete(config,"test",{}),/indisponible/);
 globalThis.fetch=async()=>new Response("",{status:401});await assert.rejects(complete({...config,mode:"openai"},"test",{}),/Clé API/);
 globalThis.fetch=async()=>Response.json({message:{content:"not json"}});await assert.rejects(complete(config,"test",{}),/JSON invalide/);
 globalThis.fetch=async()=>Response.json({message:{content:'{"ok":true}'}});assert.deepEqual(await complete(config,"test",{}),{ok:true});

 const payload=completionPayload({...config,thinking:"on",temperature:0.8,outputTokens:16000,contextTokens:16384},"Je suis C1, donne 100 mots",{currentLevel:"B2"});
 assert.equal("think" in payload?payload.think:false,true);
 assert.ok(payload.messages[0].content.includes("take precedence"));
 assert.equal("think" in completionPayload(config,"test",{}),false);
 const fastPayload=completionPayload({...config,thinking:"on"},"10 mots",{},{vocabulary:{count:10,fast:true}});
 assert.equal("think" in fastPayload?fastPayload.think:undefined,false);
 assert.ok("format" in fastPayload);
 assert.equal(typeof fastPayload.format,"object");
 if(typeof fastPayload.format==="object"){
  assert.equal((fastPayload.format as {properties:{items:{minItems:number}}}).properties.items.minItems,10);
  assert.equal((fastPayload.format as {properties:{items:{maxItems:number}}}).properties.items.maxItems,10);
 }
 const thinkingPayload=completionPayload({...config,thinking:"on"},"10 mots",{},{vocabulary:{count:10,fast:false}});
 assert.equal("think" in thinkingPayload?thinkingPayload.think:undefined,true);
 assert.equal("think" in completionPayload({...config,model:"gpt-oss:20b"},"test",{},{vocabulary:{count:10,fast:true}}),false);
 assert.equal(completionPayload({...config,mode:"openai"},"test",{},{vocabulary:{count:10,fast:true}}).response_format?.type,"json_object");
 assert.throws(()=>parseCompletionOptions({vocabulary:{count:0,fast:true}}),/invalides/);
 assert.throws(()=>validateConfig({...config,outputTokens:NaN}),/outputTokens/);
 assert.deepEqual(parseModelJson('Here is your list: ```json\n{"version":1,"items":[]}\n```'),{version:1,items:[]});
 assert.deepEqual(parseModelJson('[{"text":"hello"}]'),{version:1,items:[{text:"hello"}]});
 assert.equal(requestedCount("Je veux 100 mots complexes, je suis C1"),100);
 assert.equal(requestedCount("20 expressions pour un niveau C1"),20);
 assert.equal(requestedCount("Des mots pour C1"),null);
 assert.equal(requestedCount("cent mots"),100);
 assert.ok(vocabularyPrompt("100 mots",100,10,100,[]).includes("THIS CALL: return 10"));
 assert.equal(vocabularyPrompt("100 mots",100,10,100,[]).includes("Create 12"),false);
 const dup=uniqueVocabulary([{text:"Hello",meaning:"a greeting"},{text:" hello ",meaning:"greeting"},{text:"broken"}],new Set());
 assert.equal(dup.unique.length,1);assert.equal(dup.duplicates,1);assert.equal(dup.invalid.length,1);
 assert.equal(vocabularyKey(" To cut corners "),vocabularyKey("cut corners"));
 assert.equal(vocabularyKey("ruffle somebody’s feathers"),vocabularyKey("ruffle someone's feathers"));
 assert.notEqual(vocabularyKey("overlook"),vocabularyKey("look over"));
 assert.equal(uniqueVocabulary([{text:"to cut corners",meaning:"shortcut"}],new Set([vocabularyKey("cut corners")])).duplicates,1);
 let generationCalls=0,number=0;const sent:string[]=[];
 const completePrompts:string[]=[];const amounts:number[]=[];
 globalThis.fetch=async(_url,init)=>{
   const body=JSON.parse(String(init?.body));sent.push(body.prompt);
   if(body.action==="preview")return Response.json({request:{body:completionPayload(config,body.prompt,body.context,body.options)}});
   completePrompts.push(body.prompt);amounts.push(body.options.vocabulary.count);
   generationCalls++;const items=Array.from({length:body.options.vocabulary.count},()=>({text:`term ${++number}`,translationFr:"sens"}));
   if(generationCalls===1)items[1]={...items[0]};
   return Response.json({result:{items},trace:{raw:JSON.stringify({items}),metrics:{eval_count:300}}});
 };
 const progress:number[]=[];
 const batch=await generateVocabulary(DEFAULT_SETTINGS,"Je veux 100 mots, niveau C1",100,10,["known example"],p=>progress.push(p.items.length));
 assert.equal(batch.items.length,100);assert.equal(batch.duplicates,1);assert.equal(generationCalls,11);assert.ok(progress.includes(9));assert.ok(progress.includes(10));
 assert.deepEqual(amounts,[10,1,10,10,10,10,10,10,10,10,10]);
 assert.match(completePrompts[1],/ACCEPTED IN THIS GENERATION \(9,/);
 assert.match(completePrompts[2],/ACCEPTED IN THIS GENERATION \(10,/);
 for(const term of (batch.items.slice(0,10) as {text:string}[]))assert.ok(completePrompts[2].includes(JSON.stringify(term.text)));
 assert.ok(completePrompts.every(p=>p.includes('ALREADY IN LIBRARY (1): ["known example"]')));
 assert.equal(batch.reports[1].batch,1);assert.equal(batch.reports[1].requested,1);
 assert.ok(sent.every(p=>p.includes("Je veux 100 mots, niveau C1")));
 // Repeated output: bounded attempts, retained partial list, then continue
 // with the previous terms in memory even when library exclusion is off.
 let partial:VocabularyProgress|undefined;
 globalThis.fetch=async(_url,init)=>{
  const body=JSON.parse(String(init?.body));
  if(body.action==="preview")return Response.json({request:{}});
  return Response.json({result:{items:[{text:"to cut corners",translationFr:"bâcler"}]},trace:{}});
 };
 await assert.rejects(generateVocabulary(DEFAULT_SETTINGS,"3 mots",3,3,[],p=>{partial=p;}),/après 4 appels/);
 assert.equal(partial!.items.length,1);assert.equal(partial!.calls,4);assert.equal(partial!.duplicates,3);
 globalThis.fetch=async(_url,init)=>{
  const body=JSON.parse(String(init?.body));
  if(body.action==="preview")return Response.json({request:{}});
  assert.match(body.prompt,/ACCEPTED IN THIS GENERATION \(1,/);assert.ok(body.prompt.includes('"to cut corners"'));
  assert.equal(body.options.vocabulary.count,2);
  return Response.json({result:{items:[{text:"frugal",meaning:"economical"},{text:"wary",meaning:"cautious"}]},trace:{}});
 };
 const resumed=await generateVocabulary(DEFAULT_SETTINGS,"3 mots",3,3,[],()=>{},undefined,{resume:partial});
 assert.equal(resumed.items.length,3);assert.equal(resumed.calls,5);assert.equal(resumed.reports[4].requested,2);
 // Overproduction cannot fill future batches silently; extra terms are kept
 // in the attempted-term memory, while invalid rows stay in the preview.
 let overCalls=0;const overPrompts:string[]=[];
 globalThis.fetch=async(_url,init)=>{
  const body=JSON.parse(String(init?.body));if(body.action==="preview")return Response.json({request:{}});
  overCalls++;overPrompts.push(body.prompt);
  return Response.json({result:{items:overCalls===1?[{text:"wary",meaning:"cautious"},{text:"frugal",meaning:"economical"},{text:"broken"}]:[{text:"wry",meaning:"dryly humorous"}]},trace:{}});
 };
 const over=await generateVocabulary(DEFAULT_SETTINGS,"2 mots",2,1,[],()=>{});
 assert.equal(over.items.length,2);assert.equal(over.invalid.length,1);assert.equal(over.reports[0].overflow,1);
 assert.ok(overPrompts[1].includes('OTHER TERMS ALREADY PROPOSED (2): ["frugal","broken"]'));
 const stopped=new AbortController();stopped.abort();await assert.rejects(generateVocabulary(DEFAULT_SETTINGS,"100 mots",100,10,[],()=>{},stopped.signal),/arrêtée/);
 globalThis.fetch=async()=>Response.json({message:{content:"broken json"},done_reason:"length"});
 try{await completeDetailed(config,"test",{});assert.fail("must reject");}catch(e){const t=(e as {trace:Record<string,unknown>}).trace;assert.equal(t.raw,"broken json");assert.ok(JSON.stringify(t).includes("length"));assert.equal(JSON.stringify(t).includes("apiKey"),false);}
 globalThis.fetch=realFetch;
 await checkAIIntegration();
 await db.delete();console.log("Feature checks passed: offline, validation, ETL duplicates/rollback, profile persistence, safe exports, AI transport failures and generated content validation. AI responses mocked; no real model tested.");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
