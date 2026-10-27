import type { LanguageModel } from 'effect/ai';
import * as Effect from 'effect/Effect';
import type { AppConfig } from '../domain/config';
import { AppConfigService, getProvider } from '../domain/config';
import { TranslationError } from '../domain/errors';
import { buildTranslationPrompt } from '../domain/prompt';
import type { TranslationRequest } from '../domain/translationRequest';
import { generateTextWithConfig } from '../infrastructure/providers/providerConfig';
import { Clipboard } from './ports/clipboard';

export type TranslationInput = {
  readonly request: TranslationRequest;
  readonly sampleCount: number;
};

export type TranslationResult = {
  readonly outputs: ReadonlyArray<string>;
  readonly copiedToClipboard: boolean;
  readonly targetLanguage: string;
};

const runSingleTranslation = (request: TranslationRequest, config: AppConfig) =>
  Effect.gen(function* () {
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

export const executeTranslation = ({
  request,
  sampleCount,
}: TranslationInput) =>
  Effect.gen(function* () {
    const config = yield* AppConfigService;
    const clipboard = yield* Clipboard;

    const iterations = Array.from(
      { length: Math.max(sampleCount, 1) },
      (_, index) => index,
    );

    const translations = yield* Effect.forEach(
      iterations,
      () => runSingleTranslation(request, config),
      {
        concurrency: 'unbounded',
      },
    );

    const aggregate = translations.join('\n\n');

    let copied = false;
    if (config.translation.autoCopyToClipboard) {
      yield* clipboard.copy(aggregate);
      copied = true;
    }

    return {
      outputs: translations,
      copiedToClipboard: copied,
      targetLanguage: request.targetLanguage,
    } satisfies TranslationResult;
  });

export type TranslationRequirements =
  | LanguageModel.LanguageModel
  | AppConfigService
  | Clipboard;
