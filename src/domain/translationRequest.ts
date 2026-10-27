import * as Effect from 'effect/Effect';
import { TranslationError } from './errors';
import type { PersonaPreset } from './persona';

export type TranslationRequest = {
  readonly sourceText: string;
  readonly persona: PersonaPreset;
  readonly targetLanguage: string;
};

export type TranslationRequestParams = {
  readonly sourceText: string;
  readonly persona: PersonaPreset;
  readonly targetLanguage: string;
};

export const makeTranslationRequest = ({
  sourceText,
  persona,
  targetLanguage,
}: TranslationRequestParams): Effect.Effect<
  TranslationRequest,
  TranslationError
> =>
  Effect.gen(function* () {
    const trimmed = sourceText.trim();
    if (trimmed.length === 0) {
      return yield* new TranslationError({ message: 'Prompt cannot be empty' });
    }
    const trimmedTarget = targetLanguage.trim();
    if (trimmedTarget.length === 0) {
      return yield* new TranslationError({
        message: 'Target language cannot be empty',
      });
    }
    return {
      sourceText: trimmed,
      persona,
      targetLanguage: trimmedTarget,
    } satisfies TranslationRequest;
  });
