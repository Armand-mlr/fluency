"use client";

import { useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/schema";
import { DEFAULT_SETTINGS } from "@/lib/db/repo";
import { ALL_EXERCISES, BANK } from "@/content";
import type { Context } from "@/lib/engine/session";
import { DAY, dayKey, startOfDay } from "@/lib/util";
import type { Attempt } from "@/lib/types";

export function useSettings() {
  return useLiveQuery(() => db.settings.get("settings"), []) ?? DEFAULT_SETTINGS;
}

export function useSkills() {
  return useLiveQuery(() => db.skills.toArray(), []) ?? [];
}

/** Consecutive days with at least one answer (today not required yet). */
export function computeStreak(attempts: Pick<Attempt, "createdAt">[], now = Date.now()) {
  const days = new Set(attempts.map((a) => dayKey(a.createdAt)));
  let d = startOfDay(now);
  if (!days.has(dayKey(d))) d -= DAY; // today not done yet: streak still alive
  let n = 0;
  while (days.has(dayKey(d))) {
    n++;
    d -= DAY;
  }
  return n;
}

export function useStreak() {
  return (
    useLiveQuery(async () => {
      const since = Date.now() - 400 * DAY;
      const atts = await db.attempts.where("createdAt").above(since).toArray();
      return computeStreak(atts);
    }, []) ?? 0
  );
}

/** Everything the session builder needs, loaded in one go. */
export async function loadContext(): Promise<Context> {
  const now = Date.now();
  const [cards, items, mistakes, skills, attempts, settings] = await Promise.all([
    db.cards.toArray(),
    db.items.toArray(),
    db.mistakes.toArray(),
    db.skills.toArray(),
    db.attempts.where("createdAt").above(now - 30 * DAY).toArray(),
    db.settings.get("settings"),
  ]);
  const custom = (await db.units.toArray()).flatMap(u => u.exercises);
  return { now, cards, items, mistakes, skills, attempts, settings: settings ?? DEFAULT_SETTINGS, bank: [...BANK, ...custom], allExercises: [...ALL_EXERCISES, ...custom] };
}

/**
 * Focus mode hides the navigation while an exercise sequence is running
 * (session, diagnostic, challenge). Pages call useFocusMode(true) and the
 * AppShell listens for the event.
 */
export function useFocusMode(active: boolean) {
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("fluency:focus", { detail: active }));
    return () => {
      window.dispatchEvent(new CustomEvent("fluency:focus", { detail: false }));
    };
  }, [active]);
}
