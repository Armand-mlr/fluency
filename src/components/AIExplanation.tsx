"use client";
import { useEffect, useRef, useState } from "react";
import type { Exercise, GradeResult } from "@/lib/types";
import type { AIProvider, DetailedExplanation } from "@/lib/ai/provider";
import { Button } from "./ui";
export function AIExplanation({ai,ex,answer,result,automatic}:{ai:AIProvider|null;ex:Exercise;answer:string;result:GradeResult;automatic:boolean}){
 const [detail,setDetail]=useState<DetailedExplanation|null>(null);
 const [error,setError]=useState("");const [retry,setRetry]=useState(0);
 const busy=!!ai&&!detail&&!error&&(automatic||retry>0);
 const controller=useRef<AbortController|null>(null);
 useEffect(()=>{
  if(!ai||(!automatic&&!retry))return;
  const abort=new AbortController();controller.current=abort;
  let active=true;
  ai.explainExercise(ex,answer,result,abort.signal).then(d=>{if(active)setDetail(d);}).catch(e=>{if(active)setError((e as Error).message);});
  return ()=>{active=false;abort.abort();};
 },[ai,ex,answer,result,automatic,retry]);
 if(!ai)return null;
 return <div className="mt-5 border-t border-line pt-5">
  {busy?<div role="status" className="text-sm text-muted">Explication détaillée en cours… <Button size="sm" variant="ghost" onClick={()=>controller.current?.abort()}>Annuler l’explication</Button></div>:detail?<div className="space-y-3 text-sm leading-relaxed"><h4 className="font-semibold">La règle</h4><p className="whitespace-pre-wrap">{detail.rule}</p><h4 className="font-semibold">Dans votre exercice</h4><p className="whitespace-pre-wrap">{detail.analysis}</p><ul className="list-disc pl-5 space-y-1">{detail.examples.map((s,i)=><li key={i}>{s}</li>)}</ul><p><strong>À retenir : </strong>{detail.takeaway}</p></div>:<Button size="sm" onClick={()=>{setError("");setRetry(n=>n+1);}}>{error?"Réessayer l’explication IA":"Expliquer en détail avec l’IA"}</Button>}
  {error&&<p role="alert" className="text-sm text-warn mt-3">{error} La correction enregistrée ci-dessus reste disponible.</p>}
 </div>;
}
