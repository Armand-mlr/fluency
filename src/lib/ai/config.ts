export type AIMode = "none" | "ollama" | "openai";
export interface AIConfig { mode: AIMode; baseUrl: string; model: string; hasKey?: boolean; temperature?: number; contextTokens?: number; outputTokens?: number; timeoutSeconds?: number; thinking?: "auto" | "on" | "off" }
export const DEFAULT_AI: AIConfig = { mode: "none", baseUrl: "http://localhost:11434", model: "" };
export const LEVELS = ["B1", "B1+", "B2", "B2+", "C1", "C1+", "C2"] as const;

export const GENERATION_DEFAULTS = { temperature: 0.7, contextTokens: 8192, outputTokens: 8192, timeoutSeconds: 300, thinking: "auto" as const };
