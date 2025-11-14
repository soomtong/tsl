# Adding emojis to console output
_Exported on 11/15/2025 at 05:01:45 GMT+9 from Cursor (2.0.77)_

---

**User**

콘솔에 출력하는 문장에 add emoji 출력항목과 어울리는 것으로 

---

**Cursor**

```typescript
import { Args, Command, HelpDoc, Options, Prompt } from "@effect/cli";
import * as ValidationError from "@effect/cli/ValidationError";
import * as FileSystem from "@effect/platform/FileSystem";
import { Effect, Layer, Option } from "effect";
import * as Redacted from "effect/Redacted";
import { AppConfigService, DEFAULT_TRANSLATION_FORMATTER, defaultProfiles } from "./domain/config";
import type { AppConfig, ProfileConfig, ProviderName } from "./domain/config";
import { personaKeys, requirePersona } from "./domain/persona";
import type { PersonaKey, PersonaPreset } from "./domain/persona";
import { buildSystemMessage } from "./domain/prompt";
import { makeTranslationRequest } from "./domain/translationRequest";
import type { TranslationRequest } from "./domain/translationRequest";
import { executeTranslation } from "./application/translation";
import { loadConfig, resolveDefaultConfigPath, selectProviderOrFail } from "./infrastructure/config/configLoader";
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

const initOption = Options.boolean("init").pipe(Options.withDescription("Initialize or overwrite the tsl config and exit"));

const showConfigOption = Options.boolean("config").pipe(Options.withDescription("Show the current tsl config and exit"));

const loadShowOption = Options.boolean("load-show").pipe(
  Options.withDescription("Show the resolved config that main loads from the XDG path"),
);

const promptInfoOption = Options.boolean("prompt").pipe(Options.withDescription("Print the current system prompt and persona settings"));

const promptInput = Prompt.text({
  message: "Enter the Korean instruction to translate",
  validate: (value) => {
    const trimmed = value.trim();
    return trimmed.length === 0 ? Effect.fail("Prompt cannot be empty") : Effect.succeed(trimmed);
  },
});

const ensureLength = (value: number) => (value <= 0 ? Effect.fail(new Error("--length must be greater than 0")) : Effect.succeed(value));

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

      console.log(`🧑‍💼 [persona] ${personaProfile.key} — ${personaProfile.title}`);
      console.log(`🎯 [target] ${request.targetLanguage}`);

      result.outputs.forEach((output, index) => {
        const label = result.outputs.length === 1 ? "[translation]" : `[translation ${index + 1}]`;
        console.log(`📝 ${label}`);
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

const printPromptDetails = ({
  persona,
  profile,
  config,
  targetLanguage,
  systemMessage,
}: {
  readonly persona: PersonaPreset;
  readonly profile: ProfileConfig;
  readonly config: AppConfig;
  readonly targetLanguage: string;
  readonly systemMessage: string;
}) => {
  console.log(`🧑‍💼 [persona] ${persona.key} — ${persona.title}`);
  console.log(`🎯 [target language] ${targetLanguage}`);
  console.log(`[temperature] ${profile.temperature}`);
  console.log(`[maxTokens] ${profile.maxTokens ?? "provider default"}`);
  console.log(`[styleHint] ${profile.styleHint ?? "none"}`);
  console.log(
    `[translation settings] source=${config.translation.source} autoCopy=${config.translation.autoCopyToClipboard ? "on" : "off"}`,
  );
  console.log("[formatter]");
  console.log(config.translation.formatter);
  console.log("--- system prompt ---");
  console.log(systemMessage);
};

const showLoadedConfig = (path: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(path);
    if (!exists) {
      console.log(`⛔️ No saved config found at ${path}. Run --init first.`);
      return;
    }
    const config = yield* loadConfig(path);
    console.log(`--- resolved config (${path}) ---`);
    console.log(JSON.stringify(config, null, 2));
  }).pipe(
    Effect.catchAll((error) =>
      Effect.sync(() => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`⛔️ Failed to load config: ${message}`);
      }),
    ),
  );

```

- `src/cli-program.ts`의 Persona·Target 관련 출력에 각각 적절한 emoji를 붙여 콘솔 메시지가 더 분류감 있게 보이도록 했고, 번역 결과 라벨도 `📝` prefix를 추가해서 어떤 정보인지 한눈에 알아보도록 정리했습니다.
- `printPromptDetails`에서 제공하는 설정 출력에도 동일한 emoji를 활용해 전체 로그 스타일을 통일했습니다.

테스트: 미실행 (요청 없음)

---

**User**

based on DDD. @cli-program.ts has too many codes. some of methods and properties can refactor.

move it into separated file or section of folders.

---

**Cursor**

1. Should we extract the helper flows (`showConfigFile`, `runInitFlow`, `printPromptDetails`, etc.) into separate modules (e.g., `src/cli/config.ts`, `src/cli/output.ts`) and keep `cli-program.ts` focused just on wiring the command?  
   - a) Yes, break out each logical area into its own file/folder and keep the command definition minimal.  
   - b) No, only extract the largest helpers but keep related ones in `cli-program.ts`.  
   - c) Only refactor a specific area (please specify).

---

**User**

1. a)

Implement the plan as specified, it is attached for your reference. Do NOT edit the plan file itself.

To-do's from the plan have already been created. Do not create them again. Mark them as in_progress as you work, starting with the first one. Don't stop until you have completed all the to-dos.

---

**Cursor**

```typescript
import { Prompt } from "@effect/cli";
import * as FileSystem from "@effect/platform/FileSystem";
import { Effect } from "effect";
import * as Redacted from "effect/Redacted";
import type { AppConfig, ProviderName } from "../domain/config";
import { DEFAULT_TRANSLATION_FORMATTER, defaultProfiles } from "../domain/config";
import type { PersonaKey } from "../domain/persona";

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
  choices: [
    { title: "default", value: "default" },
    { title: "programming", value: "programming" },
    { title: "research", value: "research" },
    { title: "review", value: "review" },
  ],
});

const ensureDirectoryExists = (path: string) =>
  Effect.gen(function* () {
    const dir = path.split("/").slice(0, -1).join("/");
    if (dir.length === 0) {
      return;
    }
    const fs = yield* FileSystem.FileSystem;
    yield* fs.makeDirectory(dir, { recursive: true });
  });

const writeConfig = (path: string, config: AppConfig) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* ensureDirectoryExists(path);
    const yaml = Bun.YAML.stringify(config);
    yield* fs.writeFileString(path, yaml);
  });

export const showConfigFile = (path: string) =>
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

const buildConfigFromPrompts = ({
  provider,
  apiKey,
  preferredPersona,
}: {
  readonly provider: ProviderName;
  readonly apiKey: string;
  readonly preferredPersona: PersonaKey;
}): AppConfig => ({
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

export const runInitFlow = (path: string) =>
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

```

```typescript
import type { AppConfig, ProfileConfig } from "../domain/config";
import type { PersonaPreset } from "../domain/persona";

export const logPersonaAndTarget = (persona: PersonaPreset, targetLanguage: string) => {
  console.log(`🧑‍💼 [persona] ${persona.key} — ${persona.title}`);
  console.log(`🎯 [target] ${targetLanguage}`);
};

export const logTranslationOutputs = (outputs: ReadonlyArray<string>) => {
  outputs.forEach((text, index) => {
    const label = outputs.length === 1 ? "[translation]" : `[translation ${index + 1}]`;
    console.log(`📝 ${label}`);
    console.log(text);
    console.log("");
  });
};

export const logClipboardStatus = (copied: boolean, autoCopyEnabled: boolean) => {
  if (copied) {
    console.log("✅ Copied translation to clipboard");
  } else if (!autoCopyEnabled) {
    console.log("ℹ️ Auto-copy disabled in config");
  }
};

export const printPromptDetails = ({
  persona,
  profile,
  config,
  targetLanguage,
  systemMessage,
}: {
  readonly persona: PersonaPreset;
  readonly profile: ProfileConfig;
  readonly config: AppConfig;
  readonly targetLanguage: string;
  readonly systemMessage: string;
}) => {
  console.log(`🧑‍💼 [persona] ${persona.key} — ${persona.title}`);
  console.log(`🎯 [target language] ${targetLanguage}`);
  console.log(`[temperature] ${profile.temperature}`);
  console.log(`[maxTokens] ${profile.maxTokens ?? "provider default"}`);
  console.log(`[styleHint] ${profile.styleHint ?? "none"}`);
  console.log(
    `[translation settings] source=${config.translation.source} autoCopy=${config.translation.autoCopyToClipboard ? "on" : "off"}`,
  );
  console.log("[formatter]");
  console.log(config.translation.formatter);
  console.log("--- system prompt ---");
  console.log(systemMessage);
};

```

```typescript
import { Args, Command, HelpDoc, Options, Prompt } from "@effect/cli";
import * as ValidationError from "@effect/cli/ValidationError";
import { Effect, Layer, Option } from "effect";
import { AppConfigService } from "./domain/config";
import type { AppConfig, ProfileConfig, ProviderName } from "./domain/config";
import { personaKeys, requirePersona } from "./domain/persona";
import type { PersonaKey, PersonaPreset } from "./domain/persona";
import { buildSystemMessage } from "./domain/prompt";
import { makeTranslationRequest } from "./domain/translationRequest";
import type { TranslationRequest } from "./domain/translationRequest";
import { executeTranslation } from "./application/translation";
import { loadConfig, resolveDefaultConfigPath, selectProviderOrFail } from "./infrastructure/config/configLoader";
import { buildOpenAiTranslatorLayer } from "./infrastructure/providers/openaiTranslator";
import { MacosClipboardLayer } from "./infrastructure/clipboard/macosClipboard";
import { runInitFlow, showConfigFile } from "./cli/config";
import { logClipboardStatus, logPersonaAndTarget, logTranslationOutputs, printPromptDetails } from "./cli/output";

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

const initOption = Options.boolean("init").pipe(Options.withDescription("Initialize or overwrite the tsl config and exit"));

const showConfigOption = Options.boolean("config").pipe(Options.withDescription("Show the current tsl config and exit"));

const loadShowOption = Options.boolean("load-show").pipe(
  Options.withDescription("Show the resolved config that main loads from the XDG path"),
);

const promptInfoOption = Options.boolean("prompt").pipe(Options.withDescription("Print the current system prompt and persona settings"));

const promptInput = Prompt.text({
  message: "Enter the Korean instruction to translate",
  validate: (value) => {
    const trimmed = value.trim();
    return trimmed.length === 0 ? Effect.fail("Prompt cannot be empty") : Effect.succeed(trimmed);
  },
});

const ensureLength = (value: number) => (value <= 0 ? Effect.fail(new Error("--length must be greater than 0")) : Effect.succeed(value));

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

      console.log(`🧑‍💼 [persona] ${personaProfile.key} — ${personaProfile.title}`);
      console.log(`🎯 [target] ${request.targetLanguage}`);

      result.outputs.forEach((output, index) => {
        const label = result.outputs.length === 1 ? "[translation]" : `[translation ${index + 1}]`;
        console.log(`📝 ${label}`);
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

const printPromptDetails = ({
  persona,
  profile,
  config,
  targetLanguage,
  systemMessage,
}: {
  readonly persona: PersonaPreset;
  readonly profile: ProfileConfig;
  readonly config: AppConfig;
  readonly targetLanguage: string;
  readonly systemMessage: string;
}) => {
  console.log(`🧑‍💼 [persona] ${persona.key} — ${persona.title}`);
  console.log(`🎯 [target language] ${targetLanguage}`);
  console.log(`[temperature] ${profile.temperature}`);
  console.log(`[maxTokens] ${profile.maxTokens ?? "provider default"}`);
  console.log(`[styleHint] ${profile.styleHint ?? "none"}`);
  console.log(
    `[translation settings] source=${config.translation.source} autoCopy=${config.translation.autoCopyToClipboard ? "on" : "off"}`,
  );
  console.log("[formatter]");
  console.log(config.translation.formatter);
  console.log("--- system prompt ---");
  console.log(systemMessage);
};

const showLoadedConfig = (path: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(path);
    if (!exists) {
      console.log(`⛔️ No saved config found at ${path}. Run --init first.`);
      return;
    }
    const config = yield* loadConfig(path);
    console.log(`--- resolved config (${path}) ---`);
    console.log(JSON.stringify(config, null, 2));
  }).pipe(
    Effect.catchAll((error) =>
      Effect.sync(() => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`⛔️ Failed to load config: ${message}`);
      }),
    ),
  );

```

```typescript
import { Args, Command, HelpDoc, Options, Prompt } from "@effect/cli";
import * as ValidationError from "@effect/cli/ValidationError";
import { Effect, Layer, Option } from "effect";
import { AppConfigService } from "./domain/config";
import type { AppConfig, ProfileConfig, ProviderName } from "./domain/config";
import { personaKeys, requirePersona } from "./domain/persona";
import type { PersonaKey, PersonaPreset } from "./domain/persona";
import { buildSystemMessage } from "./domain/prompt";
import { makeTranslationRequest } from "./domain/translationRequest";
import type { TranslationRequest } from "./domain/translationRequest";
import { executeTranslation } from "./application/translation";
import { loadConfig, resolveDefaultConfigPath, selectProviderOrFail } from "./infrastructure/config/configLoader";
import { buildOpenAiTranslatorLayer } from "./infrastructure/providers/openaiTranslator";
import { MacosClipboardLayer } from "./infrastructure/clipboard/macosClipboard";
import { runInitFlow, showConfigFile } from "./cli/config";
import { logClipboardStatus, logPersonaAndTarget, logTranslationOutputs, printPromptDetails } from "./cli/output";

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

const initOption = Options.boolean("init").pipe(Options.withDescription("Initialize or overwrite the tsl config and exit"));

const showConfigOption = Options.boolean("config").pipe(Options.withDescription("Show the current tsl config and exit"));

const loadShowOption = Options.boolean("load-show").pipe(
  Options.withDescription("Show the resolved config that main loads from the XDG path"),
);

const promptInfoOption = Options.boolean("prompt").pipe(Options.withDescription("Print the current system prompt and persona settings"));

const promptInput = Prompt.text({
  message: "Enter the Korean instruction to translate",
  validate: (value) => {
    const trimmed = value.trim();
    return trimmed.length === 0 ? Effect.fail("Prompt cannot be empty") : Effect.succeed(trimmed);
  },
});

const ensureLength = (value: number) => (value <= 0 ? Effect.fail(new Error("--length must be greater than 0")) : Effect.succeed(value));

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

      console.log(`🧑‍💼 [persona] ${personaProfile.key} — ${personaProfile.title}`);
      console.log(`🎯 [target] ${request.targetLanguage}`);

      result.outputs.forEach((output, index) => {
        const label = result.outputs.length === 1 ? "[translation]" : `[translation ${index + 1}]`;
        console.log(`📝 ${label}`);
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

const printPromptDetails = ({
  persona,
  profile,
  config,
  targetLanguage,
  systemMessage,
}: {
  readonly persona: PersonaPreset;
  readonly profile: ProfileConfig;
  readonly config: AppConfig;
  readonly targetLanguage: string;
  readonly systemMessage: string;
}) => {
  console.log(`🧑‍💼 [persona] ${persona.key} — ${persona.title}`);
  console.log(`🎯 [target language] ${targetLanguage}`);
  console.log(`[temperature] ${profile.temperature}`);
  console.log(`[maxTokens] ${profile.maxTokens ?? "provider default"}`);
  console.log(`[styleHint] ${profile.styleHint ?? "none"}`);
  console.log(
    `[translation settings] source=${config.translation.source} autoCopy=${config.translation.autoCopyToClipboard ? "on" : "off"}`,
  );
  console.log("[formatter]");
  console.log(config.translation.formatter);
  console.log("--- system prompt ---");
  console.log(systemMessage);
};

const showLoadedConfig = (path: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(path);
    if (!exists) {
      console.log(`⛔️ No saved config found at ${path}. Run --init first.`);
      return;
    }
    const config = yield* loadConfig(path);
    console.log(`--- resolved config (${path}) ---`);
    console.log(JSON.stringify(config, null, 2));
  }).pipe(
    Effect.catchAll((error) =>
      Effect.sync(() => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`⛔️ Failed to load config: ${message}`);
      }),
    ),
  );

```

```typescript
import { Args, Command, HelpDoc, Options, Prompt } from "@effect/cli";
import * as ValidationError from "@effect/cli/ValidationError";
import { Effect, Layer, Option } from "effect";
import { AppConfigService } from "./domain/config";
import type { AppConfig, ProfileConfig, ProviderName } from "./domain/config";
import { personaKeys, requirePersona } from "./domain/persona";
import type { PersonaKey, PersonaPreset } from "./domain/persona";
import { buildSystemMessage } from "./domain/prompt";
import { makeTranslationRequest } from "./domain/translationRequest";
import type { TranslationRequest } from "./domain/translationRequest";
import { executeTranslation } from "./application/translation";
import { loadConfig, resolveDefaultConfigPath, selectProviderOrFail } from "./infrastructure/config/configLoader";
import { buildOpenAiTranslatorLayer } from "./infrastructure/providers/openaiTranslator";
import { MacosClipboardLayer } from "./infrastructure/clipboard/macosClipboard";
import { runInitFlow, showConfigFile } from "./cli/config";
import { logClipboardStatus, logPersonaAndTarget, logTranslationOutputs, printPromptDetails } from "./cli/output";

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

const initOption = Options.boolean("init").pipe(Options.withDescription("Initialize or overwrite the tsl config and exit"));

const showConfigOption = Options.boolean("config").pipe(Options.withDescription("Show the current tsl config and exit"));

const loadShowOption = Options.boolean("load-show").pipe(
  Options.withDescription("Show the resolved config that main loads from the XDG path"),
);

const promptInfoOption = Options.boolean("prompt").pipe(Options.withDescription("Print the current system prompt and persona settings"));

const promptInput = Prompt.text({
  message: "Enter the Korean instruction to translate",
  validate: (value) => {
    const trimmed = value.trim();
    return trimmed.length === 0 ? Effect.fail("Prompt cannot be empty") : Effect.succeed(trimmed);
  },
});

const ensureLength = (value: number) => (value <= 0 ? Effect.fail(new Error("--length must be greater than 0")) : Effect.succeed(value));

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

      logPersonaAndTarget(personaProfile, request.targetLanguage);
      logTranslationOutputs(result.outputs);
      logClipboardStatus(result.copiedToClipboard, configData.translation.autoCopyToClipboard);
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

const printPromptDetails = ({
  persona,
  profile,
  config,
  targetLanguage,
  systemMessage,
}: {
  readonly persona: PersonaPreset;
  readonly profile: ProfileConfig;
  readonly config: AppConfig;
  readonly targetLanguage: string;
  readonly systemMessage: string;
}) => {
  console.log(`🧑‍💼 [persona] ${persona.key} — ${persona.title}`);
  console.log(`🎯 [target language] ${targetLanguage}`);
  console.log(`[temperature] ${profile.temperature}`);
  console.log(`[maxTokens] ${profile.maxTokens ?? "provider default"}`);
  console.log(`[styleHint] ${profile.styleHint ?? "none"}`);
  console.log(
    `[translation settings] source=${config.translation.source} autoCopy=${config.translation.autoCopyToClipboard ? "on" : "off"}`,
  );
  console.log("[formatter]");
  console.log(config.translation.formatter);
  console.log("--- system prompt ---");
  console.log(systemMessage);
};

const showLoadedConfig = (path: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(path);
    if (!exists) {
      console.log(`⛔️ No saved config found at ${path}. Run --init first.`);
      return;
    }
    const config = yield* loadConfig(path);
    console.log(`--- resolved config (${path}) ---`);
    console.log(JSON.stringify(config, null, 2));
  }).pipe(
    Effect.catchAll((error) =>
      Effect.sync(() => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`⛔️ Failed to load config: ${message}`);
      }),
    ),
  );

```

```typescript
import { Args, Command, HelpDoc, Options, Prompt } from "@effect/cli";
import * as ValidationError from "@effect/cli/ValidationError";
import { Effect, Layer, Option } from "effect";
import { AppConfigService } from "./domain/config";
import type { AppConfig, ProfileConfig, ProviderName } from "./domain/config";
import { personaKeys, requirePersona } from "./domain/persona";
import type { PersonaKey, PersonaPreset } from "./domain/persona";
import { buildSystemMessage } from "./domain/prompt";
import { makeTranslationRequest } from "./domain/translationRequest";
import type { TranslationRequest } from "./domain/translationRequest";
import { executeTranslation } from "./application/translation";
import { loadConfig, resolveDefaultConfigPath, selectProviderOrFail } from "./infrastructure/config/configLoader";
import { buildOpenAiTranslatorLayer } from "./infrastructure/providers/openaiTranslator";
import { MacosClipboardLayer } from "./infrastructure/clipboard/macosClipboard";
import { runInitFlow, showConfigFile } from "./cli/config";
import { logClipboardStatus, logPersonaAndTarget, logTranslationOutputs, printPromptDetails } from "./cli/output";

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

const initOption = Options.boolean("init").pipe(Options.withDescription("Initialize or overwrite the tsl config and exit"));

const showConfigOption = Options.boolean("config").pipe(Options.withDescription("Show the current tsl config and exit"));

const loadShowOption = Options.boolean("load-show").pipe(
  Options.withDescription("Show the resolved config that main loads from the XDG path"),
);

const promptInfoOption = Options.boolean("prompt").pipe(Options.withDescription("Print the current system prompt and persona settings"));

const promptInput = Prompt.text({
  message: "Enter the Korean instruction to translate",
  validate: (value) => {
    const trimmed = value.trim();
    return trimmed.length === 0 ? Effect.fail("Prompt cannot be empty") : Effect.succeed(trimmed);
  },
});

const ensureLength = (value: number) => (value <= 0 ? Effect.fail(new Error("--length must be greater than 0")) : Effect.succeed(value));

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

      logPersonaAndTarget(personaProfile, request.targetLanguage);
      logTranslationOutputs(result.outputs);
      logClipboardStatus(result.copiedToClipboard, configData.translation.autoCopyToClipboard);
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

const showLoadedConfig = (path: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(path);
    if (!exists) {
      console.log(`⛔️ No saved config found at ${path}. Run --init first.`);
      return;
    }
    const config = yield* loadConfig(path);
    console.log(`--- resolved config (${path}) ---`);
    console.log(JSON.stringify(config, null, 2));
  }).pipe(
    Effect.catchAll((error) =>
      Effect.sync(() => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`⛔️ Failed to load config: ${message}`);
      }),
    ),
  );

```

```typescript
import { Args, Command, HelpDoc, Options, Prompt } from "@effect/cli";
import * as ValidationError from "@effect/cli/ValidationError";
import { Effect, Layer, Option } from "effect";
import { AppConfigService } from "./domain/config";
import { personaKeys, requirePersona } from "./domain/persona";
import type { PersonaKey, PersonaPreset } from "./domain/persona";
import { buildSystemMessage } from "./domain/prompt";
import { makeTranslationRequest } from "./domain/translationRequest";
import type { TranslationRequest } from "./domain/translationRequest";
import { executeTranslation } from "./application/translation";
import { loadConfig, resolveDefaultConfigPath, selectProviderOrFail } from "./infrastructure/config/configLoader";
import { buildOpenAiTranslatorLayer } from "./infrastructure/providers/openaiTranslator";
import { MacosClipboardLayer } from "./infrastructure/clipboard/macosClipboard";
import { runInitFlow, showConfigFile } from "./cli/config";
import { logClipboardStatus, logPersonaAndTarget, logTranslationOutputs, printPromptDetails } from "./cli/output";

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

const initOption = Options.boolean("init").pipe(Options.withDescription("Initialize or overwrite the tsl config and exit"));

const showConfigOption = Options.boolean("config").pipe(Options.withDescription("Show the current tsl config and exit"));

const loadShowOption = Options.boolean("load-show").pipe(
  Options.withDescription("Show the resolved config that main loads from the XDG path"),
);

const promptInfoOption = Options.boolean("prompt").pipe(Options.withDescription("Print the current system prompt and persona settings"));

const promptInput = Prompt.text({
  message: "Enter the Korean instruction to translate",
  validate: (value) => {
    const trimmed = value.trim();
    return trimmed.length === 0 ? Effect.fail("Prompt cannot be empty") : Effect.succeed(trimmed);
  },
});

const ensureLength = (value: number) => (value <= 0 ? Effect.fail(new Error("--length must be greater than 0")) : Effect.succeed(value));

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

      logPersonaAndTarget(personaProfile, request.targetLanguage);
      logTranslationOutputs(result.outputs);
      logClipboardStatus(result.copiedToClipboard, configData.translation.autoCopyToClipboard);
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

const showLoadedConfig = (path: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(path);
    if (!exists) {
      console.log(`⛔️ No saved config found at ${path}. Run --init first.`);
      return;
    }
    const config = yield* loadConfig(path);
    console.log(`--- resolved config (${path}) ---`);
    console.log(JSON.stringify(config, null, 2));
  }).pipe(
    Effect.catchAll((error) =>
      Effect.sync(() => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`⛔️ Failed to load config: ${message}`);
      }),
    ),
  );

```

```typescript
import { Args, Command, HelpDoc, Options, Prompt } from "@effect/cli";
import * as ValidationError from "@effect/cli/ValidationError";
import * as FileSystem from "@effect/platform/FileSystem";
import { Effect, Layer, Option } from "effect";
import { AppConfigService } from "./domain/config";
import { personaKeys, requirePersona } from "./domain/persona";
import type { PersonaKey, PersonaPreset } from "./domain/persona";
import { buildSystemMessage } from "./domain/prompt";
import { makeTranslationRequest } from "./domain/translationRequest";
import type { TranslationRequest } from "./domain/translationRequest";
import { executeTranslation } from "./application/translation";
import { loadConfig, resolveDefaultConfigPath, selectProviderOrFail } from "./infrastructure/config/configLoader";
import { buildOpenAiTranslatorLayer } from "./infrastructure/providers/openaiTranslator";
import { MacosClipboardLayer } from "./infrastructure/clipboard/macosClipboard";
import { runInitFlow, showConfigFile } from "./cli/config";
import { logClipboardStatus, logPersonaAndTarget, logTranslationOutputs, printPromptDetails } from "./cli/output";

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

const initOption = Options.boolean("init").pipe(Options.withDescription("Initialize or overwrite the tsl config and exit"));

const showConfigOption = Options.boolean("config").pipe(Options.withDescription("Show the current tsl config and exit"));

const loadShowOption = Options.boolean("load-show").pipe(
  Options.withDescription("Show the resolved config that main loads from the XDG path"),
);

const promptInfoOption = Options.boolean("prompt").pipe(Options.withDescription("Print the current system prompt and persona settings"));

const promptInput = Prompt.text({
  message: "Enter the Korean instruction to translate",
  validate: (value) => {
    const trimmed = value.trim();
    return trimmed.length === 0 ? Effect.fail("Prompt cannot be empty") : Effect.succeed(trimmed);
  },
});

const ensureLength = (value: number) => (value <= 0 ? Effect.fail(new Error("--length must be greater than 0")) : Effect.succeed(value));

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

      logPersonaAndTarget(personaProfile, request.targetLanguage);
      logTranslationOutputs(result.outputs);
      logClipboardStatus(result.copiedToClipboard, configData.translation.autoCopyToClipboard);
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

const showLoadedConfig = (path: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(path);
    if (!exists) {
      console.log(`⛔️ No saved config found at ${path}. Run --init first.`);
      return;
    }
    const config = yield* loadConfig(path);
    console.log(`--- resolved config (${path}) ---`);
    console.log(JSON.stringify(config, null, 2));
  }).pipe(
    Effect.catchAll((error) =>
      Effect.sync(() => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`⛔️ Failed to load config: ${message}`);
      }),
    ),
  );

```

- `src/cli/config.ts`에 프로바이더/Persona 프롬프트, 설정 저장/초기화/출력 로직을 모아서 `runInitFlow`와 `showConfigFile`을 외부로 노출했고, 기존 helper를 더 이상 `cli-program.ts`에 두지 않도록 정리했습니다.
- `src/cli/output.ts`에서는 Persona/타깃 출력, 번역 결과/클립보드 상태 로그, 그리고 `printPromptDetails`를 담당하게 하여 콘솔 관련 코드가 모듈화됐습니다.
- `src/cli-program.ts`는 옵션/명령 정의와 워크플로우 오케스트레이션만 남기고, 새로운 모듈에서 제공하는 helper를 가져다 써서 구조가 훨씬 가벼워졌습니다.
- `read_lints` 체크 완료(오류 없음).
- 테스트: 미실행 (요청 없음).

---

**User**

still too big. showLoadedConfig can extract a file. @cli-program.ts 

---

**Cursor**

```typescript
import * as FileSystem from "@effect/platform/FileSystem";
import { Effect } from "effect";
import { loadConfig } from "../infrastructure/config/configLoader";

export const showLoadedConfig = (path: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(path);
    if (!exists) {
      console.log(`⛔️ No saved config found at ${path}. Run --init first.`);
      return;
    }
    const config = yield* loadConfig(path);
    console.log(`--- resolved config (${path}) ---`);
    console.log(JSON.stringify(config, null, 2));
  }).pipe(
    Effect.catchAll((error) =>
      Effect.sync(() => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`⛔️ Failed to load config: ${message}`);
      }),
    ),
  );

```

```typescript
*** Begin Patch
*** Update File: /Users/dp/Repository/tsl/src/cli-program.ts
@@
-import * as FileSystem from "@effect/platform/FileSystem";
 import { Effect, Layer, Option } from "effect";
 import { AppConfigService } from "./domain/config";
 import { personaKeys, requirePersona } from "./domain/persona";
-import type { PersonaKey, PersonaPreset } from "./domain/persona";
 import { buildSystemMessage } from "./domain/prompt";
 import { makeTranslationRequest } from "./domain/translationRequest";
 import type { TranslationRequest } from "./domain/translationRequest";
 import { executeTranslation } from "./application/translation";
 import { loadConfig, resolveDefaultConfigPath, selectProviderOrFail } from "./infrastructure/config/configLoader";
 import { buildOpenAiTranslatorLayer } from "./infrastructure/providers/openaiTranslator";
 import { MacosClipboardLayer } from "./infrastructure/clipboard/macosClipboard";
 import { runInitFlow, showConfigFile } from "./cli/config";
-import { logClipboardStatus, logPersonaAndTarget, logTranslationOutputs, printPromptDetails } from "./cli/output";
+import { logClipboardStatus, logPersonaAndTarget, logTranslationOutputs, printPromptDetails } from "./cli/output";
+import { showLoadedConfig } from "./cli/inspect";
*** End Patch
```

```typescript
import { Args, Command, HelpDoc, Options, Prompt } from "@effect/cli";
import * as ValidationError from "@effect/cli/ValidationError";
import { Effect, Layer, Option } from "effect";
import { executeTranslation } from "./application/translation";
import { runInitFlow, showConfigFile } from "./cli/config";
import { logClipboardStatus, logPersonaAndTarget, logTranslationOutputs, printPromptDetails } from "./cli/output";
import { showLoadedConfig } from "./cli/inspect";
import { AppConfigService } from "./domain/config";
import { personaKeys, requirePersona } from "./domain/persona";
import { buildSystemMessage } from "./domain/prompt";
import type { TranslationRequest } from "./domain/translationRequest";
import { makeTranslationRequest } from "./domain/translationRequest";
import { MacosClipboardLayer } from "./infrastructure/clipboard/macosClipboard";
import { loadConfig, resolveDefaultConfigPath, selectProviderOrFail } from "./infrastructure/config/configLoader";
import { buildOpenAiTranslatorLayer } from "./infrastructure/providers/openaiTranslator";

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

const initOption = Options.boolean("init").pipe(Options.withDescription("Initialize or overwrite the tsl config and exit"));

const showConfigOption = Options.boolean("config").pipe(Options.withDescription("Show the current tsl config and exit"));

const loadShowOption = Options.boolean("load-show").pipe(
  Options.withDescription("Show the resolved config that main loads from the XDG path"),
);

const promptInfoOption = Options.boolean("prompt").pipe(Options.withDescription("Print the current system prompt and persona settings"));

const promptInput = Prompt.text({
  message: "Enter the Korean instruction to translate",
  validate: (value) => {
    const trimmed = value.trim();
    return trimmed.length === 0 ? Effect.fail("Prompt cannot be empty") : Effect.succeed(trimmed);
  },
});

const ensureLength = (value: number) => (value <= 0 ? Effect.fail(new Error("--length must be greater than 0")) : Effect.succeed(value));

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

      logPersonaAndTarget(personaProfile, request.targetLanguage);
      logTranslationOutputs(result.outputs);
      logClipboardStatus(result.copiedToClipboard, configData.translation.autoCopyToClipboard);
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

const showLoadedConfig = (path: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(path);
    if (!exists) {
      console.log(`⛔️ No saved config found at ${path}. Run --init first.`);
      return;
    }
    const config = yield* loadConfig(path);
    console.log(`--- resolved config (${path}) ---`);
    console.log(JSON.stringify(config, null, 2));
  }).pipe(
    Effect.catchAll((error) =>
      Effect.sync(() => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`⛔️ Failed to load config: ${message}`);
      }),
    ),
  );

```

```typescript
import { Args, Command, HelpDoc, Options, Prompt } from "@effect/cli";
import * as ValidationError from "@effect/cli/ValidationError";
import { Effect, Layer, Option } from "effect";
import { executeTranslation } from "./application/translation";
import { runInitFlow, showConfigFile } from "./cli/config";
import { logClipboardStatus, logPersonaAndTarget, logTranslationOutputs, printPromptDetails } from "./cli/output";
import { showLoadedConfig } from "./cli/inspect";
import { AppConfigService } from "./domain/config";
import { personaKeys, requirePersona } from "./domain/persona";
import { buildSystemMessage } from "./domain/prompt";
import type { TranslationRequest } from "./domain/translationRequest";
import { makeTranslationRequest } from "./domain/translationRequest";
import { MacosClipboardLayer } from "./infrastructure/clipboard/macosClipboard";
import { loadConfig, resolveDefaultConfigPath, selectProviderOrFail } from "./infrastructure/config/configLoader";
import { buildOpenAiTranslatorLayer } from "./infrastructure/providers/openaiTranslator";

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

const initOption = Options.boolean("init").pipe(Options.withDescription("Initialize or overwrite the tsl config and exit"));

const showConfigOption = Options.boolean("config").pipe(Options.withDescription("Show the current tsl config and exit"));

const loadShowOption = Options.boolean("load-show").pipe(
  Options.withDescription("Show the resolved config that main loads from the XDG path"),
);

const promptInfoOption = Options.boolean("prompt").pipe(Options.withDescription("Print the current system prompt and persona settings"));

const promptInput = Prompt.text({
  message: "Enter the Korean instruction to translate",
  validate: (value) => {
    const trimmed = value.trim();
    return trimmed.length === 0 ? Effect.fail("Prompt cannot be empty") : Effect.succeed(trimmed);
  },
});

const ensureLength = (value: number) => (value <= 0 ? Effect.fail(new Error("--length must be greater than 0")) : Effect.succeed(value));

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

      logPersonaAndTarget(personaProfile, request.targetLanguage);
      logTranslationOutputs(result.outputs);
      logClipboardStatus(result.copiedToClipboard, configData.translation.autoCopyToClipboard);
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

```

- `src/cli/inspect.ts`를 새로 만들어 `showLoadedConfig`를 여기로 옮겼습니다. 이제 config 로딩/검증 출력을 책임지고, `cli-program`은 단순히 호출만 합니다.
- `src/cli-program.ts`의 import 정리와 관련함수 제거로 파일 크기가 줄었고, main 커맨드 흐름만 남았습니다. 기존 `showLoadedConfig` 호출은 새 모듈을 참조하도록 유지했습니다.
- lint 검사 통과(변경 파일 대상). 테스트는 실행하지 않음.

---

**User**

@cli-program.ts  many const items can refactoring?

---

**Cursor**

1. 기존에 `cli-program.ts`에 남아있는 옵션/프롬프트/상수들을 별도 모듈로 분리하길 원하신다면, 어떤 항목들을 먼저 분리하면 좋을까요?  
   - a) 현재 parsing 옵션과 Prompt 정의를 `src/cli/options.ts` 같은 곳으로 옮겨주세요.  
   - b) 단지 `promptInput`, `ensureLength` 같이 실행 흐름에 직접 쓰이는 const 위주로 정리하면 될까요?

---

**User**

1. a)



translationCommand, runCli, program 제외 한 내용은 다른 곳으로 이동해도 좋다.

---

**Cursor**

```typescript
import { Args, Options, Prompt } from "@effect/cli";
import { Effect } from "effect";
import { personaKeys } from "../domain/persona";

export const promptArg = Args.optional(Args.text({ name: "prompt" }));

export const personaOption = Options.choice("persona", personaKeys).pipe(
  Options.optional,
  Options.withDescription("Selects the translation persona preset"),
);

export const langOption = Options.text("lang")
  .pipe(Options.optional)
  .pipe(Options.withDescription("Override target language (default: config target)"));

export const lengthOption = Options.integer("length")
  .pipe(Options.withDefault(1))
  .pipe(Options.withDescription("Number of translation samples to generate (default: 1)"));

export const configPathOption = Options.text("config-path")
  .pipe(Options.optional)
  .pipe(Options.withDescription("Override tsl config path (default: ~/.config/tsl/config.yaml)"));

export const initOption = Options.boolean("init").pipe(
  Options.withDescription("Initialize or overwrite the tsl config and exit"),
);

export const showConfigOption = Options.boolean("config").pipe(
  Options.withDescription("Show the current tsl config and exit"),
);

export const loadShowOption = Options.boolean("load-show").pipe(
  Options.withDescription("Show the resolved config that main loads from the XDG path"),
);

export const promptInfoOption = Options.boolean("prompt").pipe(
  Options.withDescription("Print the current system prompt and persona settings"),
);

export const promptInput = Prompt.text({
  message: "Enter the Korean instruction to translate",
  validate: (value) => {
    const trimmed = value.trim();
    return trimmed.length === 0 ? Effect.fail("Prompt cannot be empty") : Effect.succeed(trimmed);
  },
});

export const ensureLength = (value: number) =>
  value <= 0 ? Effect.fail(new Error("--length must be greater than 0")) : Effect.succeed(value);

```

```typescript
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
import { buildOpenAiTranslatorLayer } from "./infrastructure/providers/openaiTranslator";

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

      logPersonaAndTarget(personaProfile, request.targetLanguage);
      logTranslationOutputs(result.outputs);
      logClipboardStatus(result.copiedToClipboard, configData.translation.autoCopyToClipboard);
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

```

- `src/cli/options.ts`에 모든 CLI 옵션/프롬프트/유효성 검사를 모아 `cli-program.ts` 바깥으로 분리했습니다. 이제 옵션 정의를 재사용하거나 확장할 수 있고, 명령 정의 파일을 간결하게 유지합니다.
```1:38:src/cli/options.ts
import { Args, Options, Prompt } from "@effect/cli";
...
export const promptInfoOption = Options.boolean("prompt").pipe(
  Options.withDescription("Print the current system prompt and persona settings"),
);
```
- `src/cli-program.ts`는 새 모듈을 가져와 `translationCommand`만 집중 관리합니다. 상단 import 블록에서 옵션 관련 의존성을 모두 정리했고, 나머지 로직은 그대로 유지됩니다.
```1:29:src/cli-program.ts
import { Command, HelpDoc } from "@effect/cli";
...
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
```
- 검사: `read_lints src/cli-program.ts src/cli/options.ts` (이상 없음)
- 테스트: 실행하지 않음 (요청/지시 없음)

```typescript
import { Args, Options, Prompt } from "@effect/cli";
...
export const promptInfoOption = Options.boolean("prompt").pipe(
  Options.withDescription("Print the current system prompt and persona settings"),
);
```

```typescript
import { Command, HelpDoc } from "@effect/cli";
...
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
```

---

**User**

tsl --prompt show

[temperature] 0.3

[maxTokens] provider default

[styleHint] Highlight potential gaps, testing plans, and quality checks.

[translation settings] source=ko autoCopy=on

[formatter]



missing emoji. add it.

---

**Cursor**

```typescript
import type { AppConfig, ProfileConfig } from "../domain/config";
import type { PersonaPreset } from "../domain/persona";

export const logPersonaAndTarget = (persona: PersonaPreset, targetLanguage: string) => {
  console.log(`🧑‍💼 [persona] ${persona.key} — ${persona.title}`);
  console.log(`🎯 [target] ${targetLanguage}`);
};

export const logTranslationOutputs = (outputs: ReadonlyArray<string>) => {
  outputs.forEach((text, index) => {
    const label = outputs.length === 1 ? "[translation]" : `[translation ${index + 1}]`;
    console.log(`📝 ${label}`);
    console.log(text);
    console.log("");
  });
};

export const logClipboardStatus = (copied: boolean, autoCopyEnabled: boolean) => {
  if (copied) {
    console.log("✅ Copied translation to clipboard");
  } else if (!autoCopyEnabled) {
    console.log("ℹ️ Auto-copy disabled in config");
  }
};

export const printPromptDetails = ({
  persona,
  profile,
  config,
  targetLanguage,
  systemMessage,
}: {
  readonly persona: PersonaPreset;
  readonly profile: ProfileConfig;
  readonly config: AppConfig;
  readonly targetLanguage: string;
  readonly systemMessage: string;
}) => {
  console.log(`🧑‍💼 [persona] ${persona.key} — ${persona.title}`);
  console.log(`🎯 [target language] ${targetLanguage}`);
  console.log(`🌡️ [temperature] ${profile.temperature}`);
  console.log(`📏 [maxTokens] ${profile.maxTokens ?? "provider default"}`);
  console.log(`🎨 [styleHint] ${profile.styleHint ?? "none"}`);
  console.log(
    `⚙️ [translation settings] source=${config.translation.source} autoCopy=${config.translation.autoCopyToClipboard ? "on" : "off"}`,
  );
  console.log("🪄 [formatter]");
  console.log(config.translation.formatter);
  console.log("--- system prompt ---");
  console.log(systemMessage);
};

```

- `src/cli/output.ts`의 `printPromptDetails`에서 온도/토큰/스타일/번역 설정/포매터 출력에 각각 `🌡️`, `📏`, `🎨`, `⚙️`, `🪄` 이모지를 추가해 `tsl --prompt` 실행 시 다른 로그와 동일하게 시각적 구분이 되도록 했습니다.

테스트: 미실행 (요청 없음)

