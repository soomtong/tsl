import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import { ProviderError } from './errors';
import { DEFAULT_MODELS } from './models';
import type { PersonaKey } from './persona';

export type ProviderName = 'openai' | 'google' | 'openrouter';

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

export class AppConfigService extends Context.Service<
  AppConfigService,
  AppConfig
>()('tsl/AppConfig') {}

export const getProvider = (
  config: AppConfig,
  preferred?: ProviderName,
): Effect.Effect<ProviderConfig, ProviderError> =>
  Effect.gen(function* () {
    if (preferred) {
      const provider = config.providers.find(
        (entry) => entry.name === preferred,
      );
      if (!provider) {
        return yield* new ProviderError({
          message: `Provider ${preferred} not configured`,
        });
      }
      return provider;
    }

    const [first] = config.providers;
    if (!first) {
      return yield* new ProviderError({ message: 'No providers configured' });
    }
    return first;
  });

export const DEFAULT_TRANSLATION_FORMATTER =
  'Please convert the Korean prompt into concise English that coding agents understand. Keep imperative mood.';

export const defaultProfiles: Record<PersonaKey, ProfileConfig> = {
  default: {
    temperature: 0.4,
    maxTokens: 1024,
  },
  programming: {
    temperature: 0.2,
    styleHint: 'Emphasize reproducible steps and include code if needed.',
  },
  research: {
    temperature: 0.3,
    styleHint: 'Focus on assumptions, references, and structured analysis.',
  },
  review: {
    temperature: 0.3,
    styleHint: 'Highlight potential gaps, testing plans, and quality checks.',
  },
};

export const defaultTranslationSection: TranslationSection = {
  source: 'ko',
  target: 'en',
  autoCopyToClipboard: true,
  formatter: DEFAULT_TRANSLATION_FORMATTER,
};

export const buildDefaultConfig = (apiKey: string): AppConfig => ({
  providers: [
    {
      name: 'openai',
      apiKey,
      model: DEFAULT_MODELS.openai,
    },
  ],
  translation: defaultTranslationSection,
  profiles: defaultProfiles,
  preferredPersona: 'default',
});
