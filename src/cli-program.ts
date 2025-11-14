import { Args, Command, HelpDoc, Options, Prompt } from "@effect/cli";
import * as ValidationError from "@effect/cli/ValidationError";
import * as FileSystem from "@effect/platform/FileSystem";
import { Effect, Layer, Option } from "effect";
import * as Redacted from "effect/Redacted";
import { AppConfigService, DEFAULT_TRANSLATION_FORMATTER, defaultProfiles } from "./domain/config";
import type { ProviderName } from "./domain/config";
import { personaKeys, requirePersona } from "./domain/persona";
import type { PersonaKey } from "./domain/persona";
import { makeTranslationRequest } from "./domain/translationRequest";
import { executeTranslation } from "./application/translation";
import {
  loadConfig,
  resolveDefaultConfigPath,
  selectProviderOrFail,
} from "./infrastructure/config/configLoader";
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

const configPathOption = Options.text("config-path")
  .pipe(Options.optional)
  .pipe(Options.withDescription("Override tsl config path (default: ~/.config/tsl/config.yaml)"));

const initOption = Options.boolean("init").pipe(
  Options.withDescription("Initialize or overwrite the tsl config and exit"),
);

const showConfigOption = Options.boolean("config").pipe(
  Options.withDescription("Show the current tsl config and exit"),
);

const loadShowOption = Options.boolean("load-show").pipe(
  Options.withDescription("Show the configuration that the CLI loads before executing"),
);

const promptInput = Prompt.text({
  message: "Enter the Korean instruction to translate",
  validate: (value) => {
    const trimmed = value.trim();
    return trimmed.length === 0 ? Effect.fail("Prompt cannot be empty") : Effect.succeed(trimmed);
  },
});

const ensureLength = (value: number) =>
  value <= 0 ? Effect.fail(new Error("--length must be greater than 0")) : Effect.succeed(value);

const providerPrompt = Prompt.select<ProviderName>({
  message: "Select provider",
  choices: [
    { title: "openai", value: "openai", description: "Use OpenAI endpoints" },
    { title: "gemini", value: "gemini", description: "Use Google Gemini endpoints" },
  ],
});

const apiKeyPrompt = Prompt.password({
  message: "Enter API key",
  validate: (value) => {
    const trimmed = value.trim();
    return trimmed.length === 0 ? Effect.fail("API key cannot be empty") : Effect.succeed(trimmed);
  },
});

const preferredPersonaPrompt = Prompt.select<PersonaKey>({
  message: "Preferred persona",
  choices: personaKeys.map((key) => ({
    title: key,
    value: key,
  })),
});

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
  },
  ({ prompt, persona, lang, length, configPath, init, showConfig, loadShow }) =>
    Effect.gen(function* () {
      const configPathOverride = Option.getOrUndefined(configPath);
      const resolvedConfigPath = configPathOverride ?? resolveDefaultConfigPath();

      if (loadShow) {
        yield* runLoadShowFlow(resolvedConfigPath);
        return;
      }

      if (showConfig) {
        yield* showConfigFile(resolvedConfigPath);
        return;
      }

      if (init) {
        yield* runInitFlow(resolvedConfigPath);
        return;
      }

      const finalPrompt = yield* Option.match(prompt, {
        onSome: Effect.succeed,
        onNone: () => promptInput,
      });

      const configData = yield* loadConfig(configPathOverride);

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

const ensureDirectoryExists = (path: string) =>
  Effect.gen(function* () {
    const dir = path.split("/").slice(0, -1).join("/");
    if (dir.length === 0) {
      return;
    }
    const fs = yield* FileSystem.FileSystem;
    yield* fs.makeDirectory(dir, { recursive: true });
  });

const writeConfig = (path: string, config: ReturnType<typeof buildConfigFromPrompts>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* ensureDirectoryExists(path);
    const yaml = Bun.YAML.stringify(config);
    yield* fs.writeFileString(path, yaml);
  });

const showConfigFile = (path: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(path);
    if (!exists) {
      console.log(`No config found at ${path}. Use --init to create one.`);
      return;
    }
    const content = yield* fs.readFileString(path);
    console.log(`--- ${path} ---`);
    console.log(JSON.stringify(Bun.YAML.parse(content), null, 2));
  });

const runLoadShowFlow = (path: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(path);
    if (!exists) {
      console.log(`⛔️ No saved configuration found at ${path}. Use --init to create one.`);
      return;
    }
    const config = yield* loadConfig(path);
    console.log(`--- ${path} (loaded) ---`);
    console.log(JSON.stringify(config, null, 2));
  }).pipe(
    Effect.catchAll((error) =>
      Effect.sync(() => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`⛔️ Unable to load config from ${path}: ${message}`);
      }),
    ),
  );

const runInitFlow = (path: string) =>
  Effect.gen(function* () {
    const provider = yield* providerPrompt;
    const apiKey = yield* apiKeyPrompt;
    const preferredPersona = yield* preferredPersonaPrompt;

    const config = buildConfigFromPrompts({
      provider,
      apiKey: Redacted.value(apiKey),
      preferredPersona,
    });

    yield* writeConfig(path, config);
    console.log(`✅ Configuration written to ${path}`);
  });

const buildConfigFromPrompts = ({
  provider,
  apiKey,
  preferredPersona,
}: {
  readonly provider: ProviderName;
  readonly apiKey: string;
  readonly preferredPersona: PersonaKey;
}) => ({
  providers: [
    {
      name: provider,
      apiKey,
      model: provider === "openai" ? "gpt-4o-mini" : "gemini-1.5-flash",
    },
  ],
  translation: {
    source: "ko",
    target: "en",
    autoCopyToClipboard: true,
    formatter: DEFAULT_TRANSLATION_FORMATTER,
  },
  profiles: cloneProfiles(defaultProfiles),
  preferredPersona,
});

const cloneProfiles = (profiles: typeof defaultProfiles) =>
  Object.fromEntries(Object.entries(profiles).map(([key, value]) => [key, { ...value }])) as typeof defaultProfiles;

