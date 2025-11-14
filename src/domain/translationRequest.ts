import * as Effect from "effect/Effect";
import type { PersonaPreset } from "./persona";

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

export const makeTranslationRequest = ({ sourceText, persona, targetLanguage }: TranslationRequestParams) =>
  Effect.try({
    try: (): TranslationRequest => {
      const trimmed = sourceText.trim();
      if (trimmed.length === 0) {
        throw new Error("Prompt cannot be empty");
      }
      if (targetLanguage.trim().length === 0) {
        throw new Error("Target language cannot be empty");
      }
      return {
        sourceText: trimmed,
        persona,
        targetLanguage: targetLanguage.trim(),
      };
    },
    catch: (error) => (error instanceof Error ? error : new Error(String(error))),
  });
