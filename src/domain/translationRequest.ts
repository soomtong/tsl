import * as Effect from 'effect/Effect';
import { TranslationError } from './errors';
import type { PersonaPreset } from './persona';

/** What the user asked to translate, and how. */
export interface TranslationRequest {
  readonly sourceText: string;
  readonly persona: PersonaPreset;
  readonly targetLanguage: string;
}

/**
 * Normalises raw input into a request, rejecting blank text or target.
 * Both fields are trimmed so callers can pass shell or clipboard input as-is.
 */
export function makeTranslationRequest({
  sourceText,
  persona,
  targetLanguage,
}: TranslationRequest): Effect.Effect<TranslationRequest, TranslationError> {
  return Effect.gen(function* () {
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
}
