import * as Effect from 'effect/Effect';
import type { AppConfig } from '../domain/config';
import { AppConfigService, getProvider } from '../domain/config';
import { TranslationError } from '../domain/errors';
import { buildTranslationPrompt } from '../domain/prompt';
import type { TranslationRequest } from '../domain/translationRequest';
import { generateTextWithConfig } from '../infrastructure/providers/providerConfig';
import { Clipboard } from './ports/clipboard';

export interface TranslationInput {
  readonly request: TranslationRequest;
  /** How many independent samples to generate; clamped to at least 1. */
  readonly sampleCount: number;
}

export interface TranslationResult {
  readonly outputs: readonly string[];
  readonly copiedToClipboard: boolean;
  readonly targetLanguage: string;
}

function runSingleTranslation(request: TranslationRequest, config: AppConfig) {
  return Effect.gen(function* () {
    const profile = config.profiles[request.persona.key];
    if (!profile) {
      return yield* new TranslationError({
        message: `No profile defined for persona ${request.persona.key}`,
      });
    }

    const provider = yield* getProvider(config);
    const prompt = buildTranslationPrompt(request, config, profile);

    const response = yield* generateTextWithConfig(
      provider.name,
      profile,
      prompt,
    );
    const text = response.text.trim();

    if (text.length === 0) {
      return yield* new TranslationError({
        message: 'Language model returned empty text',
      });
    }

    return text;
  });
}

/**
 * Runs `sampleCount` translations concurrently, preserving input order,
 * and copies the joined result to the clipboard when the config asks for it.
 */
export function executeTranslation({ request, sampleCount }: TranslationInput) {
  return Effect.gen(function* () {
    const config = yield* AppConfigService;
    const clipboard = yield* Clipboard;

    const iterations = Array.from(
      { length: Math.max(sampleCount, 1) },
      (_, index) => index,
    );

    const translations = yield* Effect.forEach(
      iterations,
      () => runSingleTranslation(request, config),
      { concurrency: 'unbounded' },
    );

    const copiedToClipboard = config.translation.autoCopyToClipboard;
    if (copiedToClipboard) {
      yield* clipboard.copy(translations.join('\n\n'));
    }

    return {
      outputs: translations,
      copiedToClipboard,
      targetLanguage: request.targetLanguage,
    } satisfies TranslationResult;
  });
}
