import { Command } from "effect/cli";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import packageJson from "../package.json";
import { executeTranslation } from "./application/translation";
import { runInitFlow, showConfigFile } from "./cli/config";
import { showLoadedConfig } from "./cli/inspect";
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
import { logClipboardStatus, logPersonaAndTarget, logTranslationOutputs, printPromptDetails } from "./cli/output";
import { AppConfigService, getProvider } from "./domain/config";
import { requirePersona } from "./domain/persona";
import { buildSystemMessage } from "./domain/prompt";
import type { TranslationRequest } from "./domain/translationRequest";
import { makeTranslationRequest } from "./domain/translationRequest";
import { MacosClipboardLayer } from "./infrastructure/clipboard/macosClipboard";
import { loadConfig, resolveDefaultConfigPath } from "./infrastructure/config/configLoader";
import { buildTranslatorLayer } from "./infrastructure/providers/translatorFactory";

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

      const personaKey = Option.getOrElse(persona, () => configData.preferredPersona);
      const personaProfile = yield* requirePersona(personaKey);

      const profile = configData.profiles[personaProfile.key];
      if (!profile) {
        return yield* Effect.fail(new Error(`No profile defined for persona ${personaProfile.key}`));
      }

      const targetLanguage = (Option.getOrUndefined(lang) ?? configData.translation.target).trim();

      if (promptInfo) {
        const systemRequest: TranslationRequest = {
          sourceText: "",
          persona: personaProfile,
          targetLanguage,
        };
        const systemMessage = buildSystemMessage(systemRequest, configData, profile);
        yield* printPromptDetails({
          persona: personaProfile,
          profile,
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
      const provider = yield* getProvider(configData);

      const runtimeLayer = Layer.mergeAll(Layer.succeed(AppConfigService, configData), buildTranslatorLayer(provider), MacosClipboardLayer);

      const result = yield* executeTranslation({
        request,
        sampleCount,
      }).pipe(Effect.provide(runtimeLayer));

      yield* logPersonaAndTarget(personaProfile, request.targetLanguage);
      yield* logTranslationOutputs(result.outputs);
      yield* logClipboardStatus(result.copiedToClipboard, configData.translation.autoCopyToClipboard);
    }),
).pipe(Command.withDescription("Translate Korean prompts to English and copy results to the clipboard."));

export const program = Command.run(translationCommand, {
  version: packageJson.version,
});
