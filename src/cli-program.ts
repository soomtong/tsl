import { Args, Command, HelpDoc, Options, Prompt } from "@effect/cli";
import * as ValidationError from "@effect/cli/ValidationError";
import { Effect, Layer, Option } from "effect";
import { AppConfigService } from "./domain/config";
import { personaKeys, requirePersona } from "./domain/persona";
import { makeTranslationRequest } from "./domain/translationRequest";
import { executeTranslation } from "./application/translation";
import { loadConfig, selectProviderOrFail } from "./infrastructure/config/configLoader";
import { buildOpenAiTranslatorLayer } from "./infrastructure/providers/openaiTranslator";
import { MacosClipboardLayer } from "./infrastructure/clipboard/macosClipboard";

const promptArg = Args.optional(Args.text({ name: "prompt" }));

const personaOption = Options.choice("persona", personaKeys).pipe(
  Options.optional,
  Options.withDescription("Selects the translation persona preset"),
);

const langOption = Options.text("lang")
  .pipe(Options.optional)
  .pipe(Options.withDescription("Override target language (default: config target)"));

const lengthOption = Options.integer("length")
  .pipe(Options.withDefault(1))
  .pipe(Options.withDescription("Number of translation samples to generate (default: 1)"));

const configOption = Options.text("config")
  .pipe(Options.optional)
  .pipe(Options.withDescription("Override tsl config path (default: ~/.config/tsl/config.yaml)"));

const promptInput = Prompt.text({
  message: "Enter the Korean instruction to translate",
  validate: (value) => {
    const trimmed = value.trim();
    return trimmed.length === 0 ? Effect.fail("Prompt cannot be empty") : Effect.succeed(trimmed);
  },
});

const ensureLength = (value: number) =>
  value <= 0 ? Effect.fail(new Error("--length must be greater than 0")) : Effect.succeed(value);

const translationCommand = Command.make(
  "tsl",
  {
    prompt: promptArg,
    persona: personaOption,
    lang: langOption,
    length: lengthOption,
    config: configOption,
  },
  ({ prompt, persona, lang, length, config }) =>
    Effect.gen(function* () {
      const finalPrompt = yield* Option.match(prompt, {
        onSome: Effect.succeed,
        onNone: () => promptInput,
      });

      const configPath = Option.getOrUndefined(config);
      const configData = yield* loadConfig(configPath);

      const personaKey = yield* Option.match(persona, {
        onSome: Effect.succeed,
        onNone: () => Effect.succeed(configData.preferredPersona),
      });

      const personaProfile = yield* requirePersona(personaKey);

      const targetLanguage = (Option.getOrUndefined(lang) ?? configData.translation.target).trim();

      const request = yield* makeTranslationRequest({
        sourceText: finalPrompt,
        persona: personaProfile,
        targetLanguage,
      });

      const sampleCount = yield* ensureLength(length);

      const provider = selectProviderOrFail(configData, "openai");

      const runtimeLayer = Layer.mergeAll(
        Layer.succeed(AppConfigService, configData),
        buildOpenAiTranslatorLayer(provider),
        MacosClipboardLayer,
      );

      const result = yield* executeTranslation({
        request,
        sampleCount,
      }).pipe(Effect.provide(runtimeLayer));

      console.log(`[persona] ${personaProfile.key} — ${personaProfile.title}`);
      console.log(`[target] ${request.targetLanguage}`);

      result.outputs.forEach((output, index) => {
        const label = result.outputs.length === 1 ? "[translation]" : `[translation ${index + 1}]`;
        console.log(label);
        console.log(output);
        console.log("");
      });

      if (result.copiedToClipboard) {
        console.log("✅ Copied translation to clipboard");
      } else if (!configData.translation.autoCopyToClipboard) {
        console.log("ℹ️ Auto-copy disabled in config");
      }
    }),
).pipe(Command.withDescription(HelpDoc.p("Translate Korean prompts to English and copy results to the clipboard.")));

export const runCli = Command.run(translationCommand, {
  name: "tsl",
  version: "0.1.0",
});

export const program = runCli(Bun.argv).pipe(
  Effect.catchAll((error: unknown) =>
    Effect.sync(() => {
      if (ValidationError.isValidationError(error)) {
        console.error(HelpDoc.toAnsiText(error.error));
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error(`⛔️ CLI failed: ${message}`);
    }),
  ),
);

