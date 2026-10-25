import type { ProviderName } from "./config";

export const DEFAULT_MODELS = {
  openai: "gpt-6-luna",
  google: "gemini-3.8-flash",
  openrouter: "openrouter/free",
} as const satisfies Record<ProviderName, string>;
