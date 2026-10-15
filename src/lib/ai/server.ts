// Imported exclusively by the server route. Secrets never enter client bundles.
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import type { AIConfig } from "./config";
import { parseModelJson } from "./json";
import { DEFAULT_AI, GENERATION_DEFAULTS } from "./config";
import { parseCompletionOptions, taskResponseSchema, type CompletionOptions } from "./completion-options";
type Stored = AIConfig & { apiKey?: string };
const dir = path.join(process.cwd(), ".fluency");
const file = path.join(dir, "ai.json");
export async function readConfig(): Promise<Stored> {
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return { ...DEFAULT_AI }; throw new Error("Configuration IA illisible. Réenregistrez les réglages."); }
}
export function publicConfig(c: Stored): AIConfig { return { mode: c.mode, baseUrl: c.baseUrl, model: c.model, hasKey: Boolean(c.apiKey), temperature:c.temperature ?? GENERATION_DEFAULTS.temperature, contextTokens:c.contextTokens ?? GENERATION_DEFAULTS.contextTokens, outputTokens:c.outputTokens ?? GENERATION_DEFAULTS.outputTokens, timeoutSeconds:c.timeoutSeconds ?? GENERATION_DEFAULTS.timeoutSeconds, thinking:c.thinking ?? "auto" }; }
export function validateConfig(c: Stored) {
  if (!["none", "ollama", "openai"].includes(c.mode)) throw new Error("Mode IA invalide.");
  if (typeof c.model !== "string" || c.model.length > 200 || typeof c.baseUrl !== "string") throw new Error("Modèle ou URL invalide.");
  for (const [key,min,max] of [["temperature",0,2],["contextTokens",2048,131072],["outputTokens",256,65536],["timeoutSeconds",15,1800]] as const) {
    const value=c[key]; if(value!==undefined && (typeof value!=="number"||!Number.isFinite(value)||value<min||value>max||(key!=="temperature"&&!Number.isInteger(value)))) throw new Error(`${key} doit être entre ${min} et ${max}.`);
  }
  if(c.thinking!==undefined&&!["auto","on","off"].includes(c.thinking))throw new Error("Mode de réflexion invalide.");
  if (c.mode === "none") return;
  const url = new URL(c.baseUrl);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash) throw new Error("URL sans identifiants, paramètres ou fragment attendue.");
  if (c.mode === "ollama" && (!local || !["http:", "https:"].includes(url.protocol) || c.model.includes("cloud"))) throw new Error("Ollama local : utilisez localhost et un modèle téléchargé, sans suffixe cloud.");
  if (c.mode === "openai" && url.protocol !== "https:" && !(local && url.protocol === "http:")) throw new Error("Le fournisseur distant doit utiliser HTTPS.");
}
export async function storeConfig(input: Stored & { clearKey?: boolean }) {
  validateConfig(input);
  const prev = await readConfig();
  const same = prev.mode === input.mode && prev.baseUrl === input.baseUrl.replace(/\/+$/, "");
  const apiKey = input.clearKey ? undefined : input.apiKey?.trim() || (same ? prev.apiKey : undefined);
  if (apiKey && (typeof apiKey !== "string" || apiKey.length > 1000)) throw new Error("Clé API invalide.");
  const c: Stored = { temperature:input.temperature ?? prev.temperature ?? GENERATION_DEFAULTS.temperature, contextTokens:input.contextTokens ?? prev.contextTokens ?? GENERATION_DEFAULTS.contextTokens, outputTokens:input.outputTokens ?? prev.outputTokens ?? GENERATION_DEFAULTS.outputTokens, timeoutSeconds:input.timeoutSeconds ?? prev.timeoutSeconds ?? GENERATION_DEFAULTS.timeoutSeconds, thinking:input.thinking ?? prev.thinking ?? "auto", mode: input.mode, baseUrl: input.baseUrl.replace(/\/+$/, ""), model: input.model.trim(), ...(input.mode === "openai" ? { apiKey } : {}) };
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(c), { mode: 0o600 }); await rename(temp, file);
  return publicConfig(c);
}
async function request(c: Stored, suffix: string, body?: unknown, signal?: AbortSignal) {
  let response: Response;
  try {
    response = await fetch(c.baseUrl.replace(/\/+$/, "") + suffix, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", ...(c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.any([AbortSignal.timeout(body ? (c.timeoutSeconds ?? 300)*1000 : 12_000), ...(signal ? [signal] : [])]), redirect: "error", cache: "no-store" });
  } catch (e) { if(signal?.aborted)throw new Error("Génération arrêtée."); throw new Error((e as Error).name === "TimeoutError" ? "Délai dépassé. Essayez un modèle plus léger, puis réessayez." : "Serveur inaccessible. Vérifiez son URL et lancez Ollama si nécessaire."); }
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "Clé API refusée ou accès non autorisé." : response.status === 404 ? "Modèle ou endpoint indisponible. Vérifiez le modèle et l’URL du serveur." : response.status === 429 ? "Limite du fournisseur atteinte. Réessayez plus tard." : `Le fournisseur a renvoyé une erreur (${response.status}).`);
  try { return await response.json(); } catch { throw new Error("Réponse du fournisseur invalide : JSON attendu."); }
}
export async function models(c: Stored) {
  validateConfig(c);
  if (c.mode === "none") return [];
  const d = await request(c, c.mode === "ollama" ? "/api/tags" : "/models");
  const rows = c.mode === "ollama" ? d.models : d.data;
  if (!Array.isArray(rows)) throw new Error("Ce fournisseur ne fournit pas de liste de modèles. Saisissez son identifiant manuellement.");
  return rows.map((m: { name?: string; id?: string }) => c.mode === "ollama" ? m.name : m.id).filter((m: unknown): m is string => typeof m === "string" && !m.includes("cloud"));
}

export function completionPayload(c:Stored,user:string,context:unknown,completionOptions:CompletionOptions={}) {
 validateConfig(c);
 if(c.mode==="none"||!c.model)throw new Error("IA non configurée. Ouvrez les réglages et choisissez un modèle.");
 const system=`You are an English tutor. Follow the learner's explicit request: their requested level, topics, language, detail and style take precedence over the saved profile and app defaults. The profile is background, not a restriction. Use French explanations and English examples only when the learner has not requested another language. Return the requested JSON structure for the app. Do not replace an advanced-vocabulary request with generic beginner words. Saved learner context: ${JSON.stringify(context)}`;
 const parsedOptions=parseCompletionOptions(completionOptions);
 const schema=taskResponseSchema(parsedOptions);
 const messages=[{role:"system",content:system+(schema?` Response JSON schema: ${JSON.stringify(schema)}. Do not repeat root arrays inside entries.`:"")},{role:"user",content:user}];
 const options={...GENERATION_DEFAULTS,...publicConfig(c)};
 const {vocabulary}=parsedOptions;
 // Qwen3 supports disabling thinking. Other model families keep their saved
 // setting: some (e.g. gpt-oss) do not support the boolean false control.
 const fast=(vocabulary?.fast??parsedOptions.fast??false) && /^qwen3(?:[.:-]|$)/i.test(c.model);
 return c.mode==="ollama" ? {model:c.model,messages,stream:false,format:schema??"json",...(fast?{think:false}:options.thinking!=="auto"?{think:options.thinking==="on"}:{}),options:{temperature:options.temperature,num_ctx:options.contextTokens,num_predict:options.outputTokens}} : {model:c.model,messages,temperature:options.temperature,max_tokens:options.outputTokens,response_format:{type:"json_object"}};
}
export class CompletionError extends Error {
 constructor(message:string,public trace:Record<string,unknown>,public code="provider_error"){super(message);}
}
export async function completeDetailed(c:Stored,user:string,context:unknown,signal?:AbortSignal,options:CompletionOptions={}) {
 const payload=completionPayload(c,user,context,options);const started=Date.now();
 const trace:Record<string,unknown>={request:{url:c.baseUrl+(c.mode==="ollama"?"/api/chat":"/chat/completions"),body:payload,timeoutSeconds:c.timeoutSeconds??300}};
 try {
  const d=await request(c,c.mode==="ollama"?"/api/chat":"/chat/completions",payload,signal);
  const raw=c.mode==="ollama"?d.message?.content:d.choices?.[0]?.message?.content;
  trace.raw=typeof raw==="string"?raw:"";
  trace.elapsedMs=Date.now()-started;
  trace.metrics=c.mode==="ollama"?{done_reason:d.done_reason,total_duration:d.total_duration,load_duration:d.load_duration,prompt_eval_count:d.prompt_eval_count,eval_count:d.eval_count,eval_duration:d.eval_duration}: {usage:d.usage,finish_reason:d.choices?.[0]?.finish_reason};
  if(typeof raw!=="string")throw new Error("Réponse vide du modèle.");
  const finish=c.mode==="ollama"?d.done_reason:d.choices?.[0]?.finish_reason;
  if(finish==="length")throw new CompletionError("Réponse coupée : le modèle a atteint son budget de sortie. Diminuez la taille du lot ou désactivez la réflexion ; le diagnostic conserve la sortie reçue.",trace,"output_truncated");
  let result;
  try{result=parseModelJson(raw);}catch(e){throw new CompletionError((e as Error).message,trace,"invalid_json");}
  return {result,trace};
 }catch(e){trace.elapsedMs=Date.now()-started;if(e instanceof CompletionError)throw e;throw new CompletionError((e as Error).message,trace);}
}
export async function complete(c:Stored,user:string,context:unknown) {return (await completeDetailed(c,user,context)).result;}
