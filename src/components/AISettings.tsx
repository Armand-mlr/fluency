"use client";
import { useEffect, useState } from "react";
import { AIConfig, DEFAULT_AI, GENERATION_DEFAULTS } from "@/lib/ai/config";
import { aiRequest } from "@/lib/ai/client";
import { updateSettings } from "@/lib/db/repo";
import { AIDiagnostics } from "./AIDiagnostics";
import { Button } from "./ui";
export function AISettings() {
  const [config, setConfig] = useState<AIConfig>(DEFAULT_AI);
  const [key, setKey] = useState(""); const [clearKey, setClearKey] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState("Chargement de la configuration…");
  const [busy, setBusy] = useState(false); const [dirty, setDirty] = useState(false);
  const [connected, setConnected] = useState(false);
  useEffect(() => { fetch("/api/ai").then(r => r.json()).then(c => { if(c.error) throw Error(c.error); setConfig(c); setStatus(c.mode === "none" ? "IA désactivée" : "Configuration enregistrée · connexion non vérifiée"); }).catch(e => setStatus(e.message)); }, []);
  function edit(p: Partial<AIConfig>) { setConfig(c => ({ ...c, ...p })); setDirty(true); setConnected(false); setStatus("Modifications à enregistrer"); }
  async function action(type: "save" | "models" | "test") {
    setBusy(true); setConnected(false); setStatus(type === "test" ? "Connexion en cours · le délai dépend de vos paramètres…" : "En cours…");
    try {
      if (type === "save") {
        const c = await aiRequest<AIConfig>({ action: "save", config: { ...config, apiKey: key, clearKey } });
        setConfig(c); setKey(""); setClearKey(false); setDirty(false); setModels([]);
        await updateSettings({ aiProvider: c.mode, aiModel: c.model });
        setStatus(c.mode === "none" ? "IA désactivée" : "Configuration enregistrée · testez maintenant la connexion");
      } else if (type === "models") {
        const r = await aiRequest<{ models: string[] }>({ action: "models" }); setModels(r.models);
        setStatus(r.models.length ? `${r.models.length} modèles disponibles. Sélectionnez puis enregistrez.` : "Aucun modèle installé. Consultez le guide ci-dessous.");
      } else {
        await aiRequest({ action: "test" }); setConnected(true); setStatus(`Connecté · ${config.model} · vérifié à ${new Date().toLocaleTimeString()}`);
      }
    } catch(e) { setStatus((e as Error).message); } finally { setBusy(false); }
  }
  return <section id="ai" className="settings-section">
    <div className="section-index">02 / INTELLIGENCE</div>
    <div><h2 className="section-title">Un tuteur, <em>à votre rythme.</em></h2><p className="section-description">Le moteur classique reste autonome. Activez l’IA pour les corrections libres et du contenu sur mesure.</p>
    <div className="choice-grid">
      {([{mode:"none",title:"Sans IA",caption:"Exercices & révisions"},{mode:"ollama",title:"Sur cet ordinateur",caption:"Ollama · données locales"},{mode:"openai",title:"API distante",caption:"Compatible OpenAI"}] as const).map(o => <button key={o.mode} aria-pressed={config.mode===o.mode} onClick={() => { edit({mode:o.mode,baseUrl:o.mode==="ollama"?"http://localhost:11434":o.mode==="openai"?"https://api.openai.com/v1":"",model:"",hasKey:false}); setKey("");setModels([]); }} className={`choice-tile ${config.mode===o.mode?"selected":""}`}><span>{o.title}</span><small>{o.caption}</small></button>)}
    </div>
    {config.mode!=="none" && <div className="grid sm:grid-cols-2 gap-4 mt-5">
      <label className="form-label">URL du serveur<input className="field" value={config.baseUrl} onChange={e=>edit({baseUrl:e.target.value})}/><small>{config.mode==="openai"?"URL de base, avec /v1 si requis par le fournisseur.":"Le serveur doit tourner sur cet ordinateur."}</small></label>
      <label className="form-label">Modèle<input className="field" list="ai-models" placeholder="qwen3:8b" value={config.model} onChange={e=>edit({model:e.target.value})}/><datalist id="ai-models">{models.map(m=><option key={m} value={m}/>)}</datalist><small>Saisissez un identifiant ou récupérez la liste.</small></label>
      {config.mode==="openai" && <label className="form-label sm:col-span-2">Clé API {config.hasKey?"· une clé est enregistrée":""}<input className="field" type="password" autoComplete="new-password" value={key} onChange={e=>{setKey(e.target.value);setDirty(true);setConnected(false);}} placeholder="Laisser vide pour conserver la clé du même fournisseur"/><small>Conservée côté serveur dans .fluency/ai.json, jamais renvoyée au navigateur ni exportée avec le profil. Fichier local privé, non chiffré.</small><span className="flex gap-2 mt-2"><input type="checkbox" checked={clearKey} onChange={e=>{setClearKey(e.target.checked);setDirty(true);setConnected(false);}}/>Supprimer la clé enregistrée</span></label>}
    </div>}
    {config.mode!=="none"&&<details className="preview-panel"><summary>Paramètres de génération</summary><p className="text-sm text-muted mt-3">Ces réglages s’appliquent aux prochains appels. Un contexte ou une sortie plus grands consomment davantage de mémoire. Aucun réglage ne garantit la justesse du contenu.</p><div className="grid sm:grid-cols-2 gap-4 mt-4">{([{key:"temperature",label:"Température",min:0,max:2,step:0.05},{key:"outputTokens",label:"Budget de sortie (tokens)",min:256,max:65536,step:256},{key:"timeoutSeconds",label:"Délai maximal par appel (secondes)",min:15,max:1800,step:15},...(config.mode==="ollama"?[{key:"contextTokens" as const,label:"Contexte Ollama (tokens)",min:2048,max:131072,step:1024}]:[])] as const).map(f=><label className="form-label" key={f.key}>{f.label}<input className="field" type="number" min={f.min} max={f.max} step={f.step} value={config[f.key]??GENERATION_DEFAULTS[f.key]} onChange={e=>edit({[f.key]:Number(e.target.value)})}/></label>)}{config.mode==="ollama"&&<label className="form-label">Réflexion du modèle<select className="field" value={config.thinking??"auto"} onChange={e=>edit({thinking:e.target.value as "auto"|"on"|"off"})}><option value="auto">Défaut du modèle</option><option value="on">Activée</option><option value="off">Désactivée</option></select><small>Activée / désactivée nécessite un modèle compatible avec think. Si le fournisseur refuse ce paramètre, choisissez Défaut du modèle.</small></label>}</div></details>}
    <div className="flex flex-wrap gap-2 mt-5"><Button variant="primary" disabled={busy} onClick={()=>action("save")}>Enregistrer</Button>{config.mode!=="none"&&<><Button disabled={busy||dirty} onClick={()=>action("models")}>Récupérer les modèles</Button><Button disabled={busy||dirty||!config.model} onClick={()=>action("test")}>Tester la connexion</Button></>}</div>
    <p role="status" aria-live="polite" className={`status-line ${connected?"is-connected":""}`}><span className={busy?"status-dot busy":"status-dot"}/>{status}</p>
    <p className="text-sm text-muted mt-4">{config.mode==="openai"?"Mode distant : vos réponses, objectifs, centres d’intérêt et jusqu’à 8 erreurs récentes, et les termes de votre bibliothèque si vous activez leur exclusion, sont transmis au fournisseur choisi à chaque demande IA. Aucun basculement automatique vers un autre fournisseur.":"Mode local : aucun fournisseur distant n’est appelé. Avec Ollama et un modèle téléchargé, vos demandes restent sur cet ordinateur."}</p>
    <AIDiagnostics/>
    </div></section>;
}
