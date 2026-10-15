/** Accept harmless wrappers; never invent missing values or complete broken JSON. */
export function parseModelJson(raw: string): Record<string, unknown> {
 const text=raw.trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"");
 let value: unknown;
 try { value=JSON.parse(text); }
 catch { const start=text.indexOf("{"), end=text.lastIndexOf("}"); if(start<0||end<start)throw Error("JSON invalide : consultez la réponse brute dans le diagnostic.");try{value=JSON.parse(text.slice(start,end+1));}catch{throw Error("JSON invalide : consultez la réponse brute dans le diagnostic.");} }
 if(Array.isArray(value))return {version:1,items:value};
 if(!value||typeof value!=="object")throw Error("JSON invalide : objet ou liste attendu.");
 return value as Record<string,unknown>;
}
