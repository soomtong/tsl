import { Command, HelpDoc } from "@effect/cli";
import * as ValidationError from "@effect/cli/ValidationError";
import { Effect, Layer, Option } from "effect";
import { executeTranslation } from "./application/translation";
import { runInitFlow, showConfigFile } from "./cli/config";
import { logClipboardStatus, logPersonaAndTarget, logTranslationOutputs, printPromptDetails } from "./cli/output";
import {
  configPathOption,
  ensureLength,
  initOption,
  langOption,
  lengthOption,
  loadShowOption,
  personaOption,
  promptArg,
  promptInfoOption,
  promptInput,
  showConfigOption,
} from "./cli/options";
import { showLoadedConfig } from "./cli/inspect";
import { AppConfigService } from "./domain/config";
import { requirePersona } from "./domain/persona";
import { buildSystemMessage } from "./domain/prompt";
import type { TranslationRequest } from "./domain/translationRequest";
import { makeTranslationRequest } from "./domain/translationRequest";
import { MacosClipboardLayer } from "./infrastructure/clipboard/macosClipboard";
import { loadConfig, resolveDefaultConfigPath, selectProviderOrFail } from "./infrastructure/config/configLoader";
import { buildTranslatorLayer } from "./infrastructure/providers/translatorFactory";
import packageJson from "../package.json";

const translationCommand = Command.make(
  "tsl",
  {
    prompt: promptArg,
    persona: personaOption,
    lang: langOption,
    length: lengthOption,
    configPath: configPathOption,
    init: initOption,
    showConfig: showConfigOption,
    loadShow: loadShowOption,
    promptInfo: promptInfoOption,
  },
  ({ prompt, persona, lang, length, configPath, init, showConfig, loadShow, promptInfo }) =>
    Effect.gen(function* () {
      const configPathOverride = Option.getOrUndefined(configPath);
      const defaultConfigPath = resolveDefaultConfigPath();
      const resolvedConfigPath = configPathOverride ?? defaultConfigPath;

      if (showConfig) {
        yield* showConfigFile(resolvedConfigPath);
        return;
      }

      if (loadShow) {
        yield* showLoadedConfig(defaultConfigPath);
        return;
      }

      if (init) {
        yield* runInitFlow(resolvedConfigPath);
        return;
      }

      const configData = yield* loadConfig(configPathOverride);

      const personaKey = yield* Option.match(persona, {
        onSome: Effect.succeed,
        onNone: () => Effect.succeed(configData.preferredPersona),
      });

      const personaProfile = yield* requirePersona(personaKey);
      const profile = configData.profiles[personaProfile.key];
      if (!profile) {
        yield* Effect.fail(new Error(`No profile defined for persona ${personaProfile.key}`));
      }
      const personaProfileConfig = profile;

      const targetLanguage = (Option.getOrUndefined(lang) ?? configData.translation.target).trim();

      if (promptInfo) {
        const systemRequest: TranslationRequest = {
          sourceText: "",
          persona: personaProfile,
          targetLanguage,
        };
        const systemMessage = buildSystemMessage(systemRequest, configData, personaProfileConfig);
        printPromptDetails({
          persona: personaProfile,
          profile: personaProfileConfig,
          config: configData,
          targetLanguage,
          systemMessage,
        });
        return;
      }

      const finalPrompt = yield* Option.match(prompt, {
        onSome: Effect.succeed,
        onNone: () => promptInput,
      });

      const request = yield* makeTranslationRequest({
        sourceText: finalPrompt,
        persona: personaProfile,
        targetLanguage,
      });

      const sampleCount = yield* ensureLength(length);

      const provider = selectProviderOrFail(configData);

      const runtimeLayer = Layer.mergeAll(
        Layer.succeed(AppConfigService, configData),
        buildTranslatorLayer(provider),
        MacosClipboardLayer,
      );

      const result = yield* executeTranslation({
        request,
        sampleCount,
      }).pipe(Effect.provide(runtimeLayer));

      logPersonaAndTarget(personaProfile, request.targetLanguage);
      logTranslationOutputs(result.outputs);
      logClipboardStatus(result.copiedToClipboard, configData.translation.autoCopyToClipboard);
    }),
).pipe(Command.withDescription(HelpDoc.p("Translate Korean prompts to English and copy results to the clipboard.")));

export const runCli = Command.run(translationCommand, {
  name: "tsl",
  version: packageJson.version,
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
