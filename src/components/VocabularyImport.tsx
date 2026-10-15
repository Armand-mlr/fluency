"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { parseVocabulary, VOCAB_EXAMPLE, normalizeTerm, ImportRow } from "@/lib/imports/vocabulary";
import { downloadJson } from "@/lib/imports/profile";
import { importVocabulary } from "@/lib/db/repo";
import { db } from "@/lib/db/schema";
import { enrichVocabulary } from "@/lib/ai/enrich";
import { AIDiagnostics } from "./AIDiagnostics";
import { useSettings } from "@/lib/hooks";
import { getProvider } from "@/lib/ai/provider";
import { Button } from "./ui";
export function VocabularyImport({ listId, initialText = "", onDone }: { listId?: string; initialText?: string; onDone?: () => void }) {
 const [raw,setRaw]=useState(initialText); const [rows,setRows]=useState<ImportRow[]|null>(null);const [excluded,setExcluded]=useState<number[]>([]);const [policy,setPolicy]=useState<"skip"|"update">("skip");const [msg,setMsg]=useState("");const [busy,setBusy]=useState(false);const [done,setDone]=useState(false);const s=useSettings();const ai=getProvider(s);
 const existing=useLiveQuery(()=>db.items.toArray(),[]);
 const duplicates=useMemo(()=>{const seen=new Set((existing??[]).map(i=>normalizeTerm(i.text)));const dup=new Set<number>();for(const r of rows??[]){if(excluded.includes(r.index)||!r.item)continue;const key=normalizeTerm(r.item.text);if(seen.has(key))dup.add(r.index);seen.add(key);}return dup;},[existing,rows,excluded]);
 function edit(text:string){setRaw(text);setRows(null);setDone(false);setMsg("");}
 function validate(){try{setRows(parseVocabulary(raw));setExcluded([]);setMsg("");setDone(false);}catch(e){setRows(null);setMsg((e as Error).message);}}
 const controller=useRef<AbortController|null>(null);
 useEffect(()=>()=>controller.current?.abort(),[]);
 async function enrich(){if(busy)return;const abort=new AbortController();controller.current=abort;setBusy(true);setMsg("");try{const parsed=JSON.parse(raw);if(parsed.version!==1)throw Error("Version 1 attendue.");const items=await enrichVocabulary(s,parsed.items,abort.signal,n=>setMsg(`Enrichissement : ${n}/${parsed.items.length} entrées traitées`));if(abort.signal.aborted)return;const text=JSON.stringify({version:1,items},null,2);setRaw(text);setRows(parseVocabulary(text));setExcluded([]);setMsg("Champs manquants enrichis par l’IA. Vérifiez l’aperçu avant de confirmer.");}catch(e){setMsg(`${(e as Error).message} Données originales conservées.`);}finally{setBusy(false);}}

 const invalid=(rows??[]).filter(r=>!excluded.includes(r.index)&&r.errors.length).length;
 const selected=(rows??[]).filter(r=>!excluded.includes(r.index)&&r.item);
 return <div className="import-workflow"><div className="workflow-steps"><span>01 Format</span><span>02 Vérification</span><span>03 Import</span></div>
 <h3 className="font-display text-3xl mt-5">Une collection, <em>en un geste.</em></h3><p className="text-sm text-muted mt-3">Fichier JSON ou texte collé · jusqu’à 2 000 entrées · aperçu avant toute modification.</p>
 <details className="format-help"><summary>Comprendre le format JSON</summary><p>Objet avec <code>version: 1</code> et une liste <code>items</code>. Obligatoires : <code>text</code> et au moins <code>translationFr</code> ou <code>meaning</code>. Facultatifs : <code>kind</code> (word par défaut, ou expression), <code>meaning</code>, <code>example</code>, <code>exampleFr</code>, <code>level</code> (B1 à C2, variantes + admises), <code>tags</code> (liste de textes), <code>register</code> (neutral par défaut), <code>notes</code>. Un niveau absent reste non renseigné ; les exercices utilisent alors une difficulté intermédiaire.</p><pre>{JSON.stringify(VOCAB_EXAMPLE,null,2)}</pre></details>
 <div className="flex flex-wrap gap-2 my-4"><Button onClick={()=>downloadJson(VOCAB_EXAMPLE,"vocabulary-example.json")}>Télécharger l’exemple</Button><label className="file-button">Choisir un fichier<input disabled={busy} type="file" accept=".json,application/json" onChange={async e=>{const f=e.target.files?.[0];e.target.value="";if(!f)return;try{if(f.size>2_000_000)throw Error("Maximum 2 Mo.");edit(await f.text());}catch(err){setMsg((err as Error).message);}}}/></label></div>
 <label className="form-label">Contenu JSON · modifiable<textarea aria-label="Contenu JSON" className="field json-editor" rows={9} disabled={busy} value={raw} onChange={e=>edit(e.target.value)} placeholder={'{ "version": 1, "items": [{ "text": "thoughtful", "translationFr": "attentionné" }] }'}/></label>
 <div className="flex flex-wrap gap-2 mt-4"><Button variant="primary" disabled={busy||!raw.trim()} onClick={validate}>Valider et prévisualiser</Button><Button disabled={busy||!raw.trim()||!ai} onClick={enrich}>{busy?"Traitement…":"Enrichir les champs manquants avec l’IA"}</Button></div>{!ai&&<p className="text-xs text-muted mt-3">Enrichissement IA indisponible. <Link className="link" href="/settings#ai">Configurer un modèle</Link>. L’import classique reste disponible.</p>}
 {rows&&!done&&<div className="preview-panel"><div className="flex flex-wrap justify-between gap-4"><h4>{selected.length} entrées sélectionnées · {duplicates.size} doublons</h4><label className="form-label">Doublons<select className="field" value={policy} onChange={e=>setPolicy(e.target.value as "skip"|"update")}><option value="skip">Ignorer</option><option value="update">Mettre à jour les champs fournis</option></select></label></div><p className="text-xs text-muted my-3">Correspondance sur le terme anglais, espaces et casse normalisés. Les champs vides ne remplacent pas les données existantes. La progression est conservée. Dans un même fichier, la dernière valeur fournie gagne en mode mise à jour.</p>
 <div className="import-preview-list">{rows.map(r=><div key={r.index} className={`import-row ${r.errors.length?"invalid":""}`}><label><input type="checkbox" checked={!excluded.includes(r.index)} onChange={e=>setExcluded(x=>e.target.checked?x.filter(n=>n!==r.index):[...x,r.index])}/><span>#{r.index+1}</span></label><div>{r.item?<><strong>{r.item.text}</strong><p>{r.item.translationFr||r.item.meaning}</p><small>{[r.item.level||"Niveau non renseigné",r.item.kind,...r.item.tags].join(" · ")}{duplicates.has(r.index)?" · Doublon":""}</small><details><summary>Voir les champs</summary><pre>{JSON.stringify(r.item,null,2)}</pre></details></>:<p>{r.errors.join(" · ")}. Corrigez le JSON et revalidez, ou décochez cette entrée.</p>}</div></div>)}</div>
 <Button variant="primary" disabled={busy||!!invalid||!selected.length} onClick={async()=>{setBusy(true);try{const report=await importVocabulary(selected.map(r=>r.item!),policy,listId?[listId]:[]);setMsg(`Import terminé : ${report.added} ajoutés, ${report.updated} mis à jour, ${report.ignored} ignorés ; ${excluded.length} exclus. Aucune erreur de chargement.`);setDone(true);onDone?.();}catch(e){setMsg(`Import annulé, aucune modification : ${(e as Error).message}`);}finally{setBusy(false);}}}>Confirmer l’import</Button>{invalid>0&&<p className="text-bad text-sm mt-2">{invalid} entrées invalides à corriger ou exclure.</p>}</div>}
 {busy&&<Button size="sm" onClick={()=>controller.current?.abort()}>Annuler l’enrichissement</Button>}
 {ai&&<AIDiagnostics/>}
 {msg&&<p role="status" className="status-line">{msg}</p>}
 </div>;
}
