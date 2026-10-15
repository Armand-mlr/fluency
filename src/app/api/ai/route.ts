import { completeDetailed, completionPayload, CompletionError, complete, models, publicConfig, readConfig, storeConfig } from "@/lib/ai/server";
import { parseCompletionOptions } from "@/lib/ai/completion-options";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function guard(req: Request) {
  const url = new URL(req.url);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Cette API est réservée à l’application locale.");
  // Next.js may reconstruct req.url with 127.0.0.1 although the browser
  // requested localhost. Host preserves the browser-facing authority.
  const host = req.headers.get("host") ?? url.host;
  const publicUrl = new URL(`${url.protocol}//${host}`);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(publicUrl.hostname) || publicUrl.username || publicUrl.password) throw new Error("Origine non autorisée.");
  const origin = req.headers.get("origin");
  if (origin && origin !== publicUrl.origin) throw new Error("Origine non autorisée.");
  if (req.headers.get("sec-fetch-site") === "cross-site") throw new Error("Origine non autorisée.");
}
export async function GET(req: Request) {
  try { guard(req); return Response.json(publicConfig(await readConfig())); }
  catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
}
export async function POST(req: Request) {
  try {
    guard(req);
    if (!req.headers.get("content-type")?.startsWith("application/json")) throw new Error("JSON attendu.");
    const raw = await req.text(); if (raw.length > 2_000_000) throw new Error("Requête trop volumineuse.");
    const body = JSON.parse(raw);
    if (body.action === "save") return Response.json(await storeConfig(body.config));
    const c = await readConfig();
    if (body.action === "models") return Response.json({ models: await models(c) });
    if (body.action === "test") {
      if (c.mode === "ollama" && !(await models(c)).includes(c.model)) throw new Error("Modèle indisponible. Téléchargez-le avec ollama pull.");
      const answer = await complete(c, 'Return exactly {"ok":true}.', {});
      if (answer.ok !== true) throw new Error("Le modèle répond mais ne respecte pas le format attendu.");
      return Response.json({ ok: true, checkedAt: Date.now() });
    }
    if (["preview", "complete"].includes(body.action) && typeof body.prompt === "string" && body.prompt.length <= 500_000) {
      const options=parseCompletionOptions(body.options);
      if(body.action==="preview")return Response.json({request:{url:c.baseUrl+(c.mode==="ollama"?"/api/chat":"/chat/completions"),body:completionPayload(c,body.prompt,body.context,options),timeoutSeconds:c.timeoutSeconds??300}});
      return Response.json(await completeDetailed(c,body.prompt,body.context,req.signal,options));
    }
    throw new Error("Action inconnue.");
  } catch (e) { return Response.json({ error: e instanceof Error ? e.message : "Erreur IA.", ...(e instanceof CompletionError ? {trace:e.trace,code:e.code} : {}) }, { status: 400 }); }
}
