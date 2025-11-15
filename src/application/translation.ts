import { generateText } from "@effect/ai/LanguageModel";
import { withConfigOverride } from "@effect/ai-openai/OpenAiLanguageModel";
import { Effect, pipe } from "effect";
import type { AppConfig } from "../domain/config";
import { AppConfigService } from "../domain/config";
import { buildTranslationPrompt } from "../domain/prompt";
import type { TranslationRequest } from "../domain/translationRequest";
import { Clipboard } from "./ports/clipboard";

export type TranslationInput = {
  readonly request: TranslationRequest;
  readonly sampleCount: number;
};

export type TranslationResult = {
  readonly outputs: ReadonlyArray<string>;
  readonly copiedToClipboard: boolean;
  readonly targetLanguage: string;
};

const runSingleTranslation = (request: TranslationRequest, config: AppConfig) => {
  const profile = config.profiles[request.persona.key];
  if (!profile) {
    return Effect.fail(new Error(`No profile defined for persona ${request.persona.key}`));
  }

  const prompt = buildTranslationPrompt(request, config, profile);

  return pipe(
    generateText({
      prompt,
      toolChoice: "none",
    }),
    withConfigOverride({
      temperature: profile.temperature,
      max_output_tokens: profile.maxTokens ?? undefined,
    }),
    Effect.map((response) => response.text.trim()),
    Effect.filterOrFail(
      (text) => text.length > 0,
      () => new Error("Language model returned empty text"),
    ),
  );
};

export const executeTranslation = ({ request, sampleCount }: TranslationInput) =>
  Effect.gen(function* () {
    const config = yield* AppConfigService;
    const clipboard = yield* Clipboard;

    const iterations = Array.from({ length: Math.max(sampleCount, 1) }, (_, index) => index);

    const translations = yield* Effect.forEach(iterations, () => runSingleTranslation(request, config), {
      batching: "inherit",
      concurrency: "unbounded",
    });

    const aggregate = translations.join("\n\n");

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
