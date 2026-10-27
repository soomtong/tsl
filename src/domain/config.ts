import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import { ProviderError } from './errors';
import type { PersonaKey } from './persona';

export type ProviderName = 'openai' | 'google' | 'openrouter';

/** One `providers[]` entry from config.yaml with secrets already resolved. */
export interface ProviderConfig {
  readonly name: ProviderName;
  readonly apiKey: string;
  readonly model: string;
  readonly apiUrl?: string;
}

/** The `translation` section of config.yaml. */
export interface TranslationSection {
  readonly source: string;
  readonly target: string;
  readonly autoCopyToClipboard: boolean;
  readonly formatter: string;
}

/** Sampling and style settings applied per persona. */
export interface ProfileConfig {
  readonly temperature: number;
  readonly maxTokens?: number;
  readonly styleHint?: string;
}

/** Fully resolved application configuration. */
export interface AppConfig {
  readonly providers: readonly ProviderConfig[];
  readonly translation: TranslationSection;
  readonly profiles: Record<PersonaKey, ProfileConfig>;
  readonly preferredPersona: PersonaKey;
}

export class AppConfigService extends Context.Service<
  AppConfigService,
  AppConfig
>()('tsl/AppConfig') {}

/**
 * Picks the provider to use: the named one when `preferred` is given,
 * otherwise the first configured entry.
 */
export function getProvider(
  config: AppConfig,
  preferred?: ProviderName,
): Effect.Effect<ProviderConfig, ProviderError> {
  return Effect.gen(function* () {
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
}

export const DEFAULT_TRANSLATION_FORMATTER =
  'Please convert the Korean prompt into concise English that coding agents understand. Keep imperative mood.';

export const DEFAULT_PROFILES: Record<PersonaKey, ProfileConfig> = {
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

export const DEFAULT_TRANSLATION_SECTION: TranslationSection = {
  source: 'ko',
  target: 'en',
  autoCopyToClipboard: true,
  formatter: DEFAULT_TRANSLATION_FORMATTER,
};
