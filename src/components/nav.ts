import type { IconName } from "./Icon";

export const NAV: { href: string; label: string; icon: IconName; mobile?: boolean; short?: string; hint: string }[] = [
  { href: "/", label: "Today", icon: "home", mobile: true, hint: "Dashboard and today's session" },
  { href: "/lessons", label: "Leçons", icon: "layers", mobile: true, hint: "Grammar, conversation and guided learning paths" },
  { href: "/challenge", label: "Challenge", icon: "bolt", hint: "Tasks above your level" },
  { href: "/vocabulary", label: "Vocabulary", icon: "book", mobile: true, short: "Words", hint: "Your items and lists" },
  { href: "/mistakes", label: "My mistakes", icon: "target", mobile: true, short: "Mistakes", hint: "Your recurring errors" },
  { href: "/writing", label: "Writing Lab", icon: "pen", hint: "Upgrade sentences B2 → C2" },
  { href: "/nuance", label: "Register & Nuance", icon: "layers", hint: "Near-synonyms, tone" },
  { href: "/studio", label: "AI Studio", icon: "bolt", hint: "Personalized exercises, grammar and vocabulary" },
  { href: "/assessment", label: "Diagnostic", icon: "gauge", hint: "Measure your level" },
  { href: "/settings", label: "Settings", icon: "gear", mobile: true, hint: "Session, AI, backup" },
];
