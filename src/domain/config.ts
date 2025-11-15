import * as Context from "effect/Context";
import type { PersonaKey } from "./persona";

export type ProviderName = "openai" | "google";

export type ProviderConfig = {
  readonly name: ProviderName;
  readonly apiKey: string;
  readonly model: string;
  readonly apiUrl?: string;
};

export type TranslationSection = {
  readonly source: string;
  readonly target: string;
  readonly autoCopyToClipboard: boolean;
  readonly formatter: string;
};

export type ProfileConfig = {
  readonly temperature: number;
  readonly maxTokens?: number;
  readonly styleHint?: string;
};

export type AppConfig = {
  readonly providers: ReadonlyArray<ProviderConfig>;
  readonly translation: TranslationSection;
  readonly profiles: Record<PersonaKey, ProfileConfig>;
  readonly preferredPersona: PersonaKey;
};

export class AppConfigService extends Context.Tag("tsl/AppConfig")<AppConfigService, AppConfig>() {}

export const getProvider = (config: AppConfig, preferred?: ProviderName): ProviderConfig => {
  if (preferred) {
    const provider = config.providers.find((entry) => entry.name === preferred);
    if (!provider) {
      throw new Error(`Provider ${preferred} not configured`);
    }
    return provider;
  }

  const [first] = config.providers;
  if (!first) {
    throw new Error("No providers configured");
  }
  return first;
};

export const DEFAULT_TRANSLATION_FORMATTER =
  "Please convert the Korean prompt into concise English that coding agents understand. Keep imperative mood.";

export const defaultProfiles: Record<PersonaKey, ProfileConfig> = {
  default: {
    temperature: 0.4,
    maxTokens: 1024,
  },
  programming: {
    temperature: 0.2,
    styleHint: "Emphasize reproducible steps and include code if needed.",
  },
  research: {
    temperature: 0.3,
    styleHint: "Focus on assumptions, references, and structured analysis.",
  },
  review: {
    temperature: 0.3,
    styleHint: "Highlight potential gaps, testing plans, and quality checks.",
  },
};

export const buildDefaultConfig = (apiKey: string): AppConfig => ({
  providers: [
    {
      name: "openai",
      apiKey,
      model: "gpt-4o-mini",
    },
  ],
  translation: {
    source: "ko",
    target: "en",
    autoCopyToClipboard: true,
    formatter: DEFAULT_TRANSLATION_FORMATTER,
  },
  profiles: defaultProfiles,
  preferredPersona: "programming",
});
