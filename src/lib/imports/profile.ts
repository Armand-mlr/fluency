import type { Settings } from "@/lib/types";
import { LEVELS } from "@/lib/ai/config";
export const PROFILE_EXAMPLE = { app: "fluency-profile", version: 1, profile: { name: "Alex", currentLevel: "B2", targetLevel: "C2", goals: "Parler avec précision au travail", interests: "Musique, cuisine, voyages", sessionMinutes: 15, dailyGoal: 20, newItemsPerDay: 8 } };
export function exportProfile(s: Settings) {
  return { app: "fluency-profile", version: 1, profile: { name: s.name ?? "", currentLevel: s.currentLevel ?? "B2", targetLevel: s.targetLevel ?? "C2", goals: s.goals ?? "", interests: s.interests ?? "", sessionMinutes: s.sessionMinutes, dailyGoal: s.dailyGoal, newItemsPerDay: s.newItemsPerDay } };
}
export function parseProfile(raw: string): Partial<Settings> {
  if (raw.length > 50_000) throw new Error("Profil trop volumineux.");
  const d = JSON.parse(raw);
  if (d?.app !== "fluency-profile" || d.version !== 1 || !d.profile) throw new Error("Format de profil non reconnu (fluency-profile, version 1).");
  const p = d.profile;
  for (const field of ["name", "goals", "interests"]) if (typeof p[field] !== "string" || p[field].length > (field === "name" ? 100 : 2000)) throw new Error(`${field} : texte manquant ou trop long.`);
  if (!LEVELS.includes(p.currentLevel) || !LEVELS.includes(p.targetLevel)) throw new Error("Niveau invalide : B1 à C2.");
  for (const [field, min, max] of [["sessionMinutes", 5, 60], ["dailyGoal", 5, 200], ["newItemsPerDay", 0, 30]] as const) if (!Number.isInteger(p[field]) || p[field] < min || p[field] > max) throw new Error(`${field} : entier entre ${min} et ${max}.`);
  return exportProfile(p).profile;
}
export function downloadJson(value: unknown, name: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
