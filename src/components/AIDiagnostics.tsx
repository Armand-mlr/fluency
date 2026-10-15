"use client";
import { useSyncExternalStore } from "react";
import { clearTraces, emptyTraces, subscribeTrace, traceSnapshot } from "@/lib/ai/diagnostics";
import { downloadJson } from "@/lib/imports/profile";
import { Button } from "./ui";
import { APP_VERSION } from "@/lib/version";
export function AIDiagnostics(){
 const traces=useSyncExternalStore(subscribeTrace,traceSnapshot,emptyTraces);
 return <details className="preview-panel mt-6 ai-diagnostic"><summary>Diagnostic IA · requêtes exactes et réponses ({traces.length})</summary><p className="text-xs text-muted mt-3">Les 10 derniers appels de cet onglet, en mémoire uniquement. Le corps envoyé est visible pendant la génération. La réponse brute arrive à la fin : ce panneau ne montre pas les tokens en direct. Aucune clé API n’est incluse. Les textes personnels le sont.</p><div className="flex gap-2 my-4"><Button size="sm" disabled={!traces.length} onClick={()=>downloadJson(traces,"fluency-ai-diagnostic.json")}>Exporter le diagnostic</Button><Button size="sm" variant="ghost" onClick={clearTraces}>Effacer</Button></div>
 <p className="text-xs text-muted mb-3">Version de l’application : {APP_VERSION}. Les erreurs de format peuvent déclencher une seule nouvelle tentative, visible ici.</p>
 {!traces.length&&<p className="text-sm text-muted">Lancez une génération, une correction ou un enrichissement pour voir les appels.</p>}
 {traces.map(t=><details className="py-3 border-t border-line" key={t.id} open={t.status==="pending"}><summary>{new Date(t.startedAt).toLocaleTimeString()} · {t.status==="pending"?"En cours":t.status==="success"?"Réponse reçue":"Erreur"}{t.elapsedMs!==undefined?` · ${(t.elapsedMs/1000).toFixed(1)} s`:""}</summary>{t.error&&<p role="alert" className="text-bad">{t.error}</p>}<h4 className="text-sm mt-4">Requête complète — messages et paramètres</h4><pre>{JSON.stringify(t.request,null,2)}</pre>{t.raw!==undefined&&<><h4 className="text-sm">Réponse brute du modèle</h4><pre>{t.raw||"(vide)"}</pre></>}{t.metrics&&<><h4 className="text-sm">Mesures renvoyées par le fournisseur (durées Ollama en nanosecondes)</h4><pre>{JSON.stringify(t.metrics,null,2)}</pre></>}</details>)}
 </details>;
}
