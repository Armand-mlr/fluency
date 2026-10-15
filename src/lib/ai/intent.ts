export type StudioMode="exercises"|"grammar"|"vocabulary";
export function resolveStudioMode(text:string,selected:StudioMode):StudioMode{
 const t=text.toLowerCase();
 // Only override a tab for a clear request for a list. A word-count target
 // for a writing task or exercises ABOUT vocabulary is not a list request.
 if(/(?:génère|crée|propose|donne|generate|create|write)[\s\S]{0,60}(?:exercices?|exercises?|quiz|qcm)/.test(t))return selected==="grammar"?"grammar":"exercises";
 const list=/(?:génère|crée|propose|donne|je veux|generate|create|give me)[\s\S]{0,60}?\b\d+\s+(?:mots?|expressions?|words?|terms?)\b/.test(t)||/(?:une|a|ma|my)\s+list(?:e)?\s+(?:de\s+|of\s+)?(?:vocabulaire|vocabulary|mots|words|expressions)/.test(t);
 if(list&&!/(?:texte|text|paragraph|paragraphe|essay|rédaction)\s+(?:de|of|with)?\s*\d+\s+(?:mots|words)/.test(t))return "vocabulary";
 return selected;
}
