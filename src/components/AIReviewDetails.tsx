import type { GradeResult } from "@/lib/types";
export function AIReviewDetails({result}:{result:GradeResult}){
 return <div className="space-y-5 text-sm leading-relaxed mt-5">
  {!!result.strengths?.length&&<div><h4 className="font-semibold mb-2">Ce qui fonctionne</h4><ul className="list-disc pl-5 space-y-1">{result.strengths.map((s,i)=><li key={i}>{s}</li>)}</ul></div>}
  {!!result.corrections?.length&&<div><h4 className="font-semibold mb-2">Corrections expliquées</h4><div className="space-y-4">{result.corrections.map((c,i)=><div key={i} className="border-l-2 border-accent pl-4"><p><span className="text-muted">Votre formulation : </span>{c.original}</p><p><span className="text-accent">Correction : </span>{c.corrected}</p><p className="mt-2 whitespace-pre-wrap">{c.explanation}</p><p className="mt-2 italic">{c.example}</p></div>)}</div></div>}
  {result.nextStep&&<div><h4 className="font-semibold mb-2">À retenir et à pratiquer</h4><p className="whitespace-pre-wrap">{result.nextStep}</p></div>}
 </div>;
}
