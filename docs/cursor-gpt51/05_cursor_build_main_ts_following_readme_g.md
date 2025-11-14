# Build main.ts following README guidelines
_Exported on 11/15/2025 at 04:51:11 GMT+9 from Cursor (2.0.77)_

---

**User**

build main.ts file that follow @README.md 

- main.ts: main entrypoint of program

- cli.ts: cli entrypoint of application that parse args and show options



every program use effect-ts and it's company packages.

refer @poc1.ts @poc2.ts @poc3.ts @poc4.ts @poc5.ts 



based on DDD principal.



Implement the plan as specified, it is attached for your reference. Do NOT edit the plan file itself.

To-do's from the plan have already been created. Do not create them again. Mark them as in_progress as you work, starting with the first one. Don't stop until you have completed all the to-dos.

effect context manager: service docs https://effect.website/docs/requirements-management/services/ change class based service context.

---

**Cursor**

```typescript
import * as Context from "effect/Context";
import type { PersonaKey } from "./persona";

export type ProviderName = "openai" | "gemini";

export type ProviderConfig = {
  readonly name: ProviderName;
  readonly apiKey: string;
  readonly model: string;
  readonly apiUrl?: string;
};

export type TranslationSection = {
  readonly source: string;
  readonly target: string;
  readonly autoCopyToClipboard: boolean;
  readonly formatter: string;
};

export type ProfileConfig = {
  readonly temperature: number;
  readonly maxTokens?: number;
  readonly styleHint?: string;
};

export type AppConfig = {
  readonly providers: ReadonlyArray<ProviderConfig>;
  readonly translation: TranslationSection;
  readonly profiles: Record<PersonaKey, ProfileConfig>;
  readonly preferredPersona: PersonaKey;
};

export class AppConfigService extends Context.Tag("tsl/AppConfig")<AppConfigService, AppConfig>() {}

export const getProvider = (config: AppConfig, preferred?: ProviderName): ProviderConfig => {
  if (preferred) {
    const provider = config.providers.find((entry) => entry.name === preferred);
    if (!provider) {
      throw new Error(`Provider ${preferred} not configured`);
    }
    return provider;
  }

  const [first] = config.providers;
  if (!first) {
    throw new Error("No providers configured");
  }
  return first;
};

export const DEFAULT_TRANSLATION_FORMATTER =
  "Please convert the Korean prompt into concise English that coding agents understand. Keep imperative mood.";

export const defaultProfiles: Record<PersonaKey, ProfileConfig> = {
  default: {
    temperature: 0.4,
    maxTokens: 1024,
  },
  programming: {
    temperature: 0.2,
    styleHint: "Emphasize reproducible steps and include code if needed.",
  },
  research: {
    temperature: 0.3,
    styleHint: "Focus on assumptions, references, and structured analysis.",
  },
  review: {
    temperature: 0.3,
    styleHint: "Highlight potential gaps, testing plans, and quality checks.",
  },
};

export const buildDefaultConfig = (apiKey: string): AppConfig => ({
  providers: [
    {
      name: "openai",
      apiKey,
      model: "gpt-4o-mini",
    },
  ],
  translation: {
    source: "ko",
    target: "en",
    autoCopyToClipboard: true,
    formatter: DEFAULT_TRANSLATION_FORMATTER,
  },
  profiles: defaultProfiles,
  preferredPersona: "programming",
});


```

```typescript
import { LanguageModel } from "@effect/ai/LanguageModel";
import { Effect, pipe } from "effect";
import { AppConfig, AppConfigService } from "../domain/config";
import { buildTranslationPrompt } from "../domain/prompt";
import { TranslationRequest } from "../domain/translationRequest";
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
    LanguageModel.generateText({
      prompt,
      toolChoice: "none",
    }),
    Effect.map((response) => response.text.trim()),
    Effect.filterOrFail((text) => text.length > 0, () => new Error("Language model returned empty text")),
  );
};

export const executeTranslation = ({ request, sampleCount }: TranslationInput) =>
  Effect.gen(function* () {
    const config = yield* AppConfigService;
    const clipboard = yield* Clipboard;

    const iterations = Array.from({ length: Math.max(sampleCount, 1) }, (_, index) => index);

    const translations = yield* Effect.forEach(
      iterations,
      () => runSingleTranslation(request, config),
      { batching: "inherit", concurrency: "sequential" },
    );

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


```

```typescript
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

      const configData = yield* loadConfig(config);

      const personaProfile = yield* requirePersona(persona ?? configData.preferredPersona);

      const request = yield* makeTranslationRequest({
        sourceText: finalPrompt,
        persona: personaProfile,
        targetLanguage: (lang ?? configData.translation.target).trim(),
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


```

```typescript
import { Context } from "effect/Context";
import { Effect } from "effect/Effect";

export interface ClipboardPort {
  readonly copy: (text: string) => Effect<void, Error>;
}

export class Clipboard extends Context.Tag("tsl/ClipboardPort")<Clipboard, ClipboardPort>() {}


```

## 변경 사항
- Effect 공식 가이드에 맞춰 Context 서비스를 클래스 기반 Tag로 전환, Tag 식별자를 안전하게 캡슐화하도록 개선함 [[Effect 서비스 문서](https://effect.website/docs/requirements-management/services/)].
- `AppConfigService` 클래스를 도입해 구성 서비스 의존성을 명시적으로 주입하고, CLI 및 번역 모듈에서 동일 클래스를 사용하도록 업데이트함.
- `Clipboard` 포트를 클래스형 Tag로 교체해 Layer 주입 시 타입 추적을 강화함.

```33:34:src/domain/config.ts
export class AppConfigService extends Context.Tag("tsl/AppConfig")<AppConfigService, AppConfig>() {}
```

```1:8:src/application/ports/clipboard.ts
export class Clipboard extends Context.Tag("tsl/ClipboardPort")<Clipboard, ClipboardPort>() {}
```

## 테스트
- 수행하지 않음 (타입·의존성 선언 변경).

```typescript
export class AppConfigService extends Context.Tag("tsl/AppConfig")<AppConfigService, AppConfig>() {}
```

```typescript
export class Clipboard extends Context.Tag("tsl/ClipboardPort")<Clipboard, ClipboardPort>() {}
```

---

**User**

check https://effect.website/docs/ai/getting-started/ example to prompt @prompt.ts fix error

---

**Cursor**

```typescript
import { Prompt } from "@effect/ai";
import type { AppConfig, ProfileConfig } from "./config";
import type { TranslationRequest } from "./translationRequest";

const buildSystemMessage = (request: TranslationRequest, config: AppConfig, profile: ProfileConfig) => {
  const sections = [
    `You are a bilingual assistant that translates ${config.translation.source.toUpperCase()} engineering requirements into concise ${request.targetLanguage.toUpperCase()} instructions.`,
    config.translation.formatter,
    `Persona directive: ${request.persona.system}`,
  ];

  if (profile.styleHint) {
    sections.push(`Style hint: ${profile.styleHint}`);
  }

  return sections.join("\n\n");
};

const buildUserMessage = (request: TranslationRequest, config: AppConfig) => {
  const lines = [
    `Source language (${config.translation.source}):`,
    request.sourceText,
    "",
    "Respond with the translated instruction only.",
  ];
  return lines.join("\n");
};

export const buildTranslationPrompt = (request: TranslationRequest, config: AppConfig, profile: ProfileConfig) =>
  Prompt.make([
    {
      role: "system",
      content: buildSystemMessage(request, config, profile),
    },
    {
      role: "user",
      content: buildUserMessage(request, config),
    },
  ]);


```

- Prompt 모듈을 Getting Started 예제처럼 패키지 루트에서 불러오도록 수정해 `Prompt.make` 네임스페이스 오류를 방지했어 [[Effect Getting Started](https://effect.website/docs/ai/getting-started/)].
- 적용 코드:

```1:4:src/domain/prompt.ts
import { Prompt } from "@effect/ai";
```

- 테스트: 미실행 (의존성 정리 변경)

```typescript
import { Prompt } from "@effect/ai";
```

---

**User**

For the code present, we get this error:
```
Argument of type 'Option<PersonaKey>' is not assignable to parameter of type 'string | undefined'.
  Type 'None<PersonaKey>' is not assignable to type 'string'.
```
Fix it, verify, and then give a concise explanation. @cli.ts (59-62) 

---

**Cursor**

```typescript
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

      const configData = yield* loadConfig(config);

      const personaKey = yield* Option.match(persona, {
        onSome: Effect.succeed,
        onNone: () => Effect.succeed(configData.preferredPersona),
      });

      const personaProfile = yield* requirePersona(personaKey);

      const request = yield* makeTranslationRequest({
        sourceText: finalPrompt,
        persona: personaProfile,
        targetLanguage: (lang ?? configData.translation.target).trim(),
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


```

```typescript
*** Begin Patch
*** Update File: src/cli.ts
@@
-      const configData = yield* loadConfig(config);
+      const configPath = Option.getOrUndefined(config);
+      const configData = yield* loadConfig(configPath);
@@
-      const request = yield* makeTranslationRequest({
+      const targetLanguage = (Option.getOrUndefined(lang) ?? configData.translation.target).trim();
+
+      const request = yield* makeTranslationRequest({
         sourceText: finalPrompt,
         persona: personaProfile,
-        targetLanguage: (lang ?? configData.translation.target).trim(),
+        targetLanguage,
       });
*** End Patch
```

```typescript
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


```

- `Option` 값이 그대로 전달되던 `config`, `persona`, `lang`을 각각 `Option.getOrUndefined`와 `Option.match`로 수동 해제해 `requirePersona`, `loadConfig`, `makeTranslationRequest`에 정확한 문자열/`undefined`만 전달되도록 정리함.  
```
60:74:src/cli.ts
      const configPath = Option.getOrUndefined(config);
      const configData = yield* loadConfig(configPath);

      const personaKey = yield* Option.match(persona, {
        onSome: Effect.succeed,
        onNone: () => Effect.succeed(configData.preferredPersona),
      });
...
      const targetLanguage = (Option.getOrUndefined(lang) ?? configData.translation.target).trim();
```
- 검증: `read_lints src/cli.ts` 실행해 추가 경고·에러 없음 확인.

```plaintext
60:74:src/cli.ts
      const configPath = Option.getOrUndefined(config);
      const configData = yield* loadConfig(configPath);

      const personaKey = yield* Option.match(persona, {
        onSome: Effect.succeed,
        onNone: () => Effect.succeed(configData.preferredPersona),
      });
...
      const targetLanguage = (Option.getOrUndefined(lang) ?? configData.translation.target).trim();
```

---

**User**

change @cli.ts to `cli-program.ts`

---

**Cursor**

```typescript
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { Effect } from "effect";
import { program } from "./cli-program";

BunRuntime.runMain(program.pipe(Effect.provide(BunContext.layer)));

```

- `src/cli.ts`를 `src/cli-program.ts`로 이동해 CLI 엔트리 파일명을 요청대로 일치시켰고, `src/main.ts`의 import 경로도 새 파일명으로 갱신함.
- `read_lints src/main.ts`로 변경 후 린트 확인했으며 추가 경고 없음.

추가 확인 필요 시 `bun run src/cli-program.ts --help` 등으로 실행 흐름 점검 권장.

---

**User**

For the code present, we get this error:
```
Object literal may only specify known properties, and 'input' does not exist in type 'SpawnSyncOptions<"pipe", "ignore", "pipe">'.
```
Fix it, verify, and then give a concise explanation. @macosClipboard.ts (11-14) 

---

**Cursor**

```typescript
import * as Layer from "effect/Layer";
import * as Effect from "effect/Effect";
import { Clipboard } from "../../application/ports/clipboard";

const copyToClipboard = (text: string) =>
  Effect.try({
    try: () => {
      const result = Bun.spawnSync(["/usr/bin/pbcopy"], {
        stdin: text,
        stdout: "ignore",
        stderr: "pipe",
      });

      if (result.exitCode !== 0) {
        const stderr = result.stderr ? new TextDecoder().decode(result.stderr).trim() : "unknown error";
        throw new Error(`pbcopy failed: ${stderr}`);
      }
    },
    catch: (error) => (error instanceof Error ? error : new Error(String(error))),
  });

export const MacosClipboardLayer = Layer.succeed(Clipboard, {
  copy: copyToClipboard,
});


```

```typescript
import * as Layer from "effect/Layer";
import * as Effect from "effect/Effect";
import { Clipboard } from "../../application/ports/clipboard";

const copyToClipboard = (text: string) =>
  Effect.try({
    try: () => {
      const inputBuffer = new TextEncoder().encode(text);

      const result = Bun.spawnSync(["/usr/bin/pbcopy"], {
        stdin: inputBuffer,
        stdout: "ignore",
        stderr: "pipe",
      });

      if (result.exitCode !== 0) {
        const stderr = result.stderr ? new TextDecoder().decode(result.stderr).trim() : "unknown error";
        throw new Error(`pbcopy failed: ${stderr}`);
      }
    },
    catch: (error) => (error instanceof Error ? error : new Error(String(error))),
  });

export const MacosClipboardLayer = Layer.succeed(Clipboard, {
  copy: copyToClipboard,
});


```

- `pbcopy` 실행 시 stdin 타입 제한 때문에 `string`을 직접 넘기지 못해 `TextEncoder`로 UTF-8 바이트 배열을 만든 뒤 전달하도록 수정했어.
```
5:18:src/infrastructure/clipboard/macosClipboard.ts
      const inputBuffer = new TextEncoder().encode(text);

      const result = Bun.spawnSync(["/usr/bin/pbcopy"], {
        stdin: inputBuffer,
        stdout: "ignore",
        stderr: "pipe",
      });
```
- 검증: `read_lints src/infrastructure/clipboard/macosClipboard.ts`로 확인했으며 추가 경고 없음.

```plaintext
5:18:src/infrastructure/clipboard/macosClipboard.ts
      const inputBuffer = new TextEncoder().encode(text);

      const result = Bun.spawnSync(["/usr/bin/pbcopy"], {
        stdin: inputBuffer,
        stdout: "ignore",
        stderr: "pipe",
      });
```

---

**User**

add missing `--init` and `--config` @README.md (71-72) @README.md (74-75) 

based on @poc5.ts into @cli-program.ts 

---

**Cursor**

```typescript
import { Args, Command, HelpDoc, Options, Prompt } from "@effect/cli";
import * as ValidationError from "@effect/cli/ValidationError";
import * as FileSystem from "@effect/platform/FileSystem";
import { Effect, Layer, Option } from "effect";
import * as Redacted from "effect/Redacted";
import { AppConfigService, DEFAULT_TRANSLATION_FORMATTER, ProviderName, defaultProfiles } from "./domain/config";
import { PersonaKey, personaKeys, requirePersona } from "./domain/persona";
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
  },
  ({ prompt, persona, lang, length, configPath, init, showConfig }) =>
    Effect.gen(function* () {
      const configPathOverride = Option.getOrUndefined(configPath);
      const resolvedConfigPath = configPathOverride ?? resolveDefaultConfigPath();

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

const writeConfig = (path: string, config: Parameters<typeof buildConfigFromPrompts>[0]) =>
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
    console.log(content);
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


```

```typescript
import { Args, Command, HelpDoc, Options, Prompt } from "@effect/cli";
import * as ValidationError from "@effect/cli/ValidationError";
import * as FileSystem from "@effect/platform/FileSystem";
import { Effect, Layer, Option } from "effect";
import * as Redacted from "effect/Redacted";
import { AppConfigService, DEFAULT_TRANSLATION_FORMATTER, ProviderName, defaultProfiles } from "./domain/config";
import { PersonaKey, personaKeys, requirePersona } from "./domain/persona";
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
  },
  ({ prompt, persona, lang, length, configPath, init, showConfig }) =>
    Effect.gen(function* () {
      const configPathOverride = Option.getOrUndefined(configPath);
      const resolvedConfigPath = configPathOverride ?? resolveDefaultConfigPath();

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
    console.log(content);
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


```

```typescript
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
  },
  ({ prompt, persona, lang, length, configPath, init, showConfig }) =>
    Effect.gen(function* () {
      const configPathOverride = Option.getOrUndefined(configPath);
      const resolvedConfigPath = configPathOverride ?? resolveDefaultConfigPath();

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
    console.log(content);
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


```

- `tsl --config`와 `tsl --init`이 실제로 동작하도록 `poc5.ts`의 설정 초기화/표시 플로우를 `cli-program.ts`에 통합했어. `--config`는 현재 YAML을 출력하고 `--init`은 프로바이더·API 키·선호 페르소나를 묻는 인터랙티브 절차를 거쳐 설정 파일을 생성한다.
- 기존 경로 오버라이드 옵션은 `--config-path`로 옮겨 충돌을 피웠고, 두 기능 모두 기본 경로(`~/.config/tsl/config.yaml`)나 `--config-path`가 가리키는 위치에서 동작하도록 했다.
- 새 플로우는 파일 시스템 의존성과 레이어 기반 구조를 그대로 유지하며, 번역 실행 로직 전에 조기에 종료되도록 분기했다.

```58:107:src/cli-program.ts
      const configPathOverride = Option.getOrUndefined(configPath);
      const resolvedConfigPath = configPathOverride ?? resolveDefaultConfigPath();

      if (showConfig) {
        yield* showConfigFile(resolvedConfigPath);
        return;
      }

      if (init) {
        yield* runInitFlow(resolvedConfigPath);
        return;
      }
```

## 테스트
- 수행하지 않음 (기능 플래그 및 I/O 루틴 추가).

```typescript
      const configPathOverride = Option.getOrUndefined(configPath);
      const resolvedConfigPath = configPathOverride ?? resolveDefaultConfigPath();

      if (showConfig) {
        yield* showConfigFile(resolvedConfigPath);
        return;
      }

      if (init) {
        yield* runInitFlow(resolvedConfigPath);
        return;
      }
```

---

**User**

@README.md (73-74) implement `--load-show` option. that load from XDG Base Directory configuration that we saved. if not exists that fail. not throw program.

---

**Cursor**

```typescript
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
  Options.withDescription("Show the resolved config that main loads from the XDG path"),
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

- `--load-show` 옵션을 추가해 XDG 기본 경로에 저장된 설정이 실제 런타임에서 어떻게 로드되는지 JSON 형태로 출력하고, 파일이 없으면 종료하지 않고 안내만 하도록 분기했어 `src/cli-program.ts`.  
```78:102:src/cli-program.ts
    if (loadShow) {
      yield* showLoadedConfig(defaultConfigPath);
      return;
    }
```
- 보조 유틸을 추가해 존재 여부를 확인하고 `loadConfig`로 해석된 설정을 출력하며, 실패 시에도 메시지로만 안내하도록 처리했어.  
```200:215:src/cli-program.ts
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

## 테스트
- 미실행 (옵션 로직 추가).

```typescript
    if (loadShow) {
      yield* showLoadedConfig(defaultConfigPath);
      return;
    }
```

```typescript
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

---

**User**

basic action is not works. @cli-program.ts 

 make it work based on @poc2.ts @README.md (77) 

---

**Cursor**

```typescript
import * as FileSystem from "@effect/platform/FileSystem";
import { Effect, Option, pipe } from "effect";
import {
  AppConfig,
  ProviderConfig,
  ProviderName,
  DEFAULT_TRANSLATION_FORMATTER,
  defaultProfiles,
} from "../../domain/config";
import { PersonaKey, fallbackPersonaKey } from "../../domain/persona";

const ENV_PATTERN = /^\$\{ENV:([A-Z0-9_]+)\}$/i;

const requireEnvVar = (name: string) =>
  pipe(
    Effect.fromNullable(Bun.env[name] ?? process.env[name]),
    Effect.orElseFail(() => new Error(`Missing required env var: ${name}`)),
  );

const substituteEnv = (value: string) => {
  const match = value.match(ENV_PATTERN);
  if (!match) {
    return Effect.succeed(value);
  }
  return requireEnvVar(match[1]);
};

const resolveProviderSecrets = (providers: ReadonlyArray<ProviderConfig>) =>
  Effect.forEach(
    providers,
    (provider) =>
      pipe(
        substituteEnv(provider.apiKey),
        Effect.map((apiKey) => ({
          ...provider,
          apiKey,
        })),
      ),
    { concurrency: "unbounded" },
  );

const mergeProfiles = (
  base: Record<PersonaKey, (typeof defaultProfiles)[PersonaKey]>,
  overrides: Partial<Record<PersonaKey, (typeof defaultProfiles)[PersonaKey]>> | undefined,
) => {
  if (!overrides) {
    return base;
  }
  const entries = Object.entries(base).map(([key, value]) => {
    const maybeOverride = overrides[key as PersonaKey];
    return [key, maybeOverride ? { ...value, ...maybeOverride } : value];
  });
  return Object.fromEntries(entries) as typeof base;
};

const parseConfig = (raw: string): Partial<AppConfig> | undefined => {
  const parsed = Bun.YAML.parse(raw) as Partial<AppConfig> | undefined;
  return parsed ?? undefined;
};

const readConfigFile = (path: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(path);
    if (!exists) {
      return Option.none<string>();
    }
    const content = yield* fs.readFileString(path);
    return Option.some(content);
  });

const determineBaseDir = () => {
  const xdgHome = Bun.env.XDG_CONFIG_HOME ?? process.env.XDG_CONFIG_HOME;
  if (xdgHome && xdgHome.length > 0) {
    return xdgHome;
  }
  const homeDir = Bun.env.HOME ?? process.env.HOME;
  if (homeDir && homeDir.length > 0) {
    return `${homeDir}/.config`;
  }
  return ".";
};

export const resolveDefaultConfigPath = () => `${determineBaseDir()}/tsl/config.yaml`;

export const loadConfig = (pathOverride?: string) =>
  Effect.gen(function* () {
    const targetPath = pathOverride ?? resolveDefaultConfigPath();

    const content = yield* readConfigFile(targetPath);

    const partial = pipe(
      content,
      Option.map(parseConfig),
      Option.getOrUndefined,
    );

    const providers = yield* ensureProviders(partial?.providers);
    const translation = partial?.translation ? { ...defaultTranslationSection, ...partial.translation } : defaultTranslationSection;
    const profiles = mergeProfiles(defaultProfiles, partial?.profiles);
    const preferredPersona = partial?.preferredPersona ?? fallbackPersonaKey;

    const resolvedProviders = yield* resolveProviderSecrets(providers);

    if (resolvedProviders.length === 0) {
      throw new Error("No providers available after resolving config");
    }

    return {
      providers: resolvedProviders,
      translation,
      profiles,
      preferredPersona,
    };
  });

export const selectProviderOrFail = (config: AppConfig, preferred?: ProviderName): ProviderConfig => {
  if (preferred) {
    const provider = config.providers.find((entry) => entry.name === preferred);
    if (!provider) {
      throw new Error(`Provider ${preferred} not found in config`);
    }
    return provider;
  }
  const [first] = config.providers;
  if (!first) {
    throw new Error("No providers defined");
  }
  return first;
};

const ensureProviders = (providers: ReadonlyArray<ProviderConfig> | undefined) =>
  Effect.gen(function* () {
    if (providers && providers.length > 0) {
      return providers;
    }
    const openAiKey = yield* requireEnvVar("OPENAI_API_KEY");
    return [
      {
        name: "openai",
        apiKey: openAiKey,
        model: "gpt-4o-mini",
      },
    ] satisfies ReadonlyArray<ProviderConfig>;
  });

const defaultTranslationSection: AppConfig["translation"] = {
  source: "ko",
  target: "en",
  autoCopyToClipboard: true,
  formatter: DEFAULT_TRANSLATION_FORMATTER,
};


```

```typescript
import * as FileSystem from "@effect/platform/FileSystem";
import { Effect, Option, pipe } from "effect";
import { DEFAULT_TRANSLATION_FORMATTER, defaultProfiles } from "../../domain/config";
import type { AppConfig, ProviderConfig, ProviderName } from "../../domain/config";
import { fallbackPersonaKey } from "../../domain/persona";
import type { PersonaKey } from "../../domain/persona";

const ENV_PATTERN = /^\$\{ENV:([A-Z0-9_]+)\}$/i;

const requireEnvVar = (name: string) =>
  pipe(
    Effect.fromNullable(Bun.env[name] ?? process.env[name]),
    Effect.orElseFail(() => new Error(`Missing required env var: ${name}`)),
  );

const substituteEnv = (value: string) => {
  const match = value.match(ENV_PATTERN);
  if (!match) {
    return Effect.succeed(value);
  }
  const envVar = match[1]!;
  return requireEnvVar(envVar);
};

const resolveProviderSecrets = (providers: ReadonlyArray<ProviderConfig>) =>
  Effect.forEach(
    providers,
    (provider) =>
      pipe(
        substituteEnv(provider.apiKey),
        Effect.map((apiKey) => ({
          ...provider,
          apiKey,
        })),
      ),
    { concurrency: "unbounded" },
  );

const mergeProfiles = (
  base: Record<PersonaKey, (typeof defaultProfiles)[PersonaKey]>,
  overrides: Partial<Record<PersonaKey, (typeof defaultProfiles)[PersonaKey]>> | undefined,
) => {
  if (!overrides) {
    return base;
  }
  const entries = Object.entries(base).map(([key, value]) => {
    const maybeOverride = overrides[key as PersonaKey];
    return [key, maybeOverride ? { ...value, ...maybeOverride } : value];
  });
  return Object.fromEntries(entries) as typeof base;
};

const parseConfig = (raw: string): Partial<AppConfig> | undefined => {
  const parsed = Bun.YAML.parse(raw) as Partial<AppConfig> | undefined;
  return parsed ?? undefined;
};

const readConfigFile = (path: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(path);
    if (!exists) {
      return Option.none<string>();
    }
    const content = yield* fs.readFileString(path);
    return Option.some(content);
  });

const determineBaseDir = () => {
  const xdgHome = Bun.env.XDG_CONFIG_HOME ?? process.env.XDG_CONFIG_HOME;
  if (xdgHome && xdgHome.length > 0) {
    return xdgHome;
  }
  const homeDir = Bun.env.HOME ?? process.env.HOME;
  if (homeDir && homeDir.length > 0) {
    return `${homeDir}/.config`;
  }
  return ".";
};

export const resolveDefaultConfigPath = () => `${determineBaseDir()}/tsl/config.yaml`;

export const loadConfig = (pathOverride?: string) =>
  Effect.gen(function* () {
    const targetPath = pathOverride ?? resolveDefaultConfigPath();

    const content = yield* readConfigFile(targetPath);

    const partial = pipe(
      content,
      Option.map(parseConfig),
      Option.getOrUndefined,
    );

    const providers = yield* ensureProviders(partial?.providers);
    const translation = partial?.translation ? { ...defaultTranslationSection, ...partial.translation } : defaultTranslationSection;
    const profiles = mergeProfiles(defaultProfiles, partial?.profiles);
    const preferredPersona = partial?.preferredPersona ?? fallbackPersonaKey;

    const resolvedProviders = yield* resolveProviderSecrets(providers);

    if (resolvedProviders.length === 0) {
      throw new Error("No providers available after resolving config");
    }

    return {
      providers: resolvedProviders,
      translation,
      profiles,
      preferredPersona,
    };
  });

export const selectProviderOrFail = (config: AppConfig, preferred?: ProviderName): ProviderConfig => {
  if (preferred) {
    const provider = config.providers.find((entry) => entry.name === preferred);
    if (!provider) {
      throw new Error(`Provider ${preferred} not found in config`);
    }
    return provider;
  }
  const [first] = config.providers;
  if (!first) {
    throw new Error("No providers defined");
  }
  return first;
};

const ensureProviders = (providers: ReadonlyArray<ProviderConfig> | undefined) =>
  Effect.gen(function* () {
    if (providers && providers.length > 0) {
      return providers;
    }
    const openAiKey = yield* requireEnvVar("OPENAI_API_KEY");
    return [
      {
        name: "openai",
        apiKey: openAiKey,
        model: "gpt-4o-mini",
      },
    ] satisfies ReadonlyArray<ProviderConfig>;
  });

const defaultTranslationSection: AppConfig["translation"] = {
  source: "ko",
  target: "en",
  autoCopyToClipboard: true,
  formatter: DEFAULT_TRANSLATION_FORMATTER,
};


```

- `loadConfig`가 항상 `OPENAI_API_KEY` 환경 변수를 요구해 저장된 YAML만으로는 기본 번역 명령(`tsl "..."`)이 동작하지 않았어. 파일이 존재하면 그 내용을 먼저 읽고, 제공자 정보가 비어 있을 때만 환경 변수로 OpenAI 기본값을 채우도록 재구성했어. 번역·프로필 섹션도 자체 기본값(`DEFAULT_TRANSLATION_FORMATTER`, `defaultProfiles`)으로 병합해 README의 기본 시나리오가 설정 파일만으로 실행돼.  
```1:153:src/infrastructure/config/configLoader.ts
const ensureProviders = (providers: ReadonlyArray<ProviderConfig> | undefined) =>
  Effect.gen(function* () {
    if (providers && providers.length > 0) {
      return providers;
    }
    const openAiKey = yield* requireEnvVar("OPENAI_API_KEY");
    return [
      { name: "openai", apiKey: openAiKey, model: "gpt-4o-mini" },
    ] satisfies ReadonlyArray<ProviderConfig>;
  });

const defaultTranslationSection: AppConfig["translation"] = {
  source: "ko",
  target: "en",
  autoCopyToClipboard: true,
  formatter: DEFAULT_TRANSLATION_FORMATTER,
};
```
- 타입 전용 import와 정규식 안전성도 정리해서 `loadConfig` 호출 경로 어디에서든 저장된 설정만으로 기본 명령이 실행돼.

## 테스트
- 실행하지 않음 (환경 의존 번역이라 키 없음).

```typescript
const ensureProviders = (providers: ReadonlyArray<ProviderConfig> | undefined) =>
  Effect.gen(function* () {
    if (providers && providers.length > 0) {
      return providers;
    }
    const openAiKey = yield* requireEnvVar("OPENAI_API_KEY");
    return [
      { name: "openai", apiKey: openAiKey, model: "gpt-4o-mini" },
    ] satisfies ReadonlyArray<ProviderConfig>;
  });

const defaultTranslationSection: AppConfig["translation"] = {
  source: "ko",
  target: "en",
  autoCopyToClipboard: true,
  formatter: DEFAULT_TRANSLATION_FORMATTER,
};
```

---

**User**

ERROR (#17):

  TypeError: undefined is not an object (evaluating 'tag.key')

    at make (/Users/dp/Repository/tsl/node_modules/effect/dist/esm/internal/context.js:172:61)

    at <anonymous> (/Users/dp/Repository/tsl/node_modules/effect/dist/esm/internal/layer.js:399:49)

    at buildOpenAiTranslatorLayer (/Users/dp/Repository/tsl/src/infrastructure/providers/openaiTranslator.ts:30:25)

    at <anonymous> (/Users/dp/Repository/tsl/src/cli-program.ts:147:9)

---

**Cursor**

```typescript
import * as IdGenerator from "@effect/ai/IdGenerator";
import * as FetchHttpClient from "@effect/platform/FetchHttpClient";
import * as OpenAiClient from "@effect/ai-openai/OpenAiClient";
import * as OpenAiLanguageModel from "@effect/ai-openai/OpenAiLanguageModel";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import type { ProviderConfig } from "../../domain/config";

export const buildOpenAiTranslatorLayer = (provider: ProviderConfig) => {
  if (provider.name !== "openai") {
    throw new Error("OpenAI translator requires a provider with name 'openai'");
  }

  const httpLayer = FetchHttpClient.layer;
  const clientLayer = Layer.provide(
    OpenAiClient.layer({
      apiKey: Redacted.make(provider.apiKey),
      apiUrl: provider.apiUrl,
    }),
    httpLayer,
  );

  const modelLayer = Layer.provide(
    OpenAiLanguageModel.layer({
      model: provider.model,
    }),
    clientLayer,
  );

  const idLayer = Layer.succeed(IdGenerator.IdGenerator, IdGenerator.defaultIdGenerator);

  return Layer.merge(modelLayer, idLayer);
};


```

- `buildOpenAiTranslatorLayer`에서 `IdGenerator`를 단일 심볼로 import해 `IdGenerator.defaultIdGenerator` 접근 시 `undefined`가 되어 Tag 생성에서 런타임 오류가 났음. 모듈 전체를 namespace import(`import * as IdGenerator`)로 바꾸고 `ProviderConfig`도 type-only import로 정리해 Layer가 올바른 Tag와 서비스를 제공하도록 수정했어.
- 린트: `read_lints src/infrastructure/providers/openaiTranslator.ts`로 확인했고 추가 문제 없음.

```1:35:src/infrastructure/providers/openaiTranslator.ts
import * as IdGenerator from "@effect/ai/IdGenerator";
...
const idLayer = Layer.succeed(IdGenerator.IdGenerator, IdGenerator.defaultIdGenerator);
```

```typescript
import * as IdGenerator from "@effect/ai/IdGenerator";
...
const idLayer = Layer.succeed(IdGenerator.IdGenerator, IdGenerator.defaultIdGenerator);
```

---

**User**

ERROR (#17):

  TypeError: undefined is not an object (evaluating 'LanguageModel.Service.generateText')

    at runSingleTranslation (/Users/dp/Repository/tsl/src/application/translation.ts:29:19)

    at <anonymous> (/Users/dp/Repository/tsl/node_modules/effect/dist/esm/internal/fiberRuntime.js:1427:437)

    at fn (/Users/dp/Repository/tsl/node_modules/effect/dist/esm/internal/fiberRuntime.js:1433:37)

    at next (/Users/dp/Repository/tsl/node_modules/effect/dist/esm/internal/fiberRuntime.js:1519:54)

    at <anonymous> (/Users/dp/Repository/tsl/node_modules/effect/dist/esm/internal/fiberRuntime.js:1555:7)

---

**Cursor**

```typescript
import { LanguageModel } from "@effect/ai/LanguageModel";
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
    LanguageModel.generateText({
      prompt,
      toolChoice: "none",
    }),
    Effect.map((response) => response.text.trim()),
    Effect.filterOrFail((text) => text.length > 0, () => new Error("Language model returned empty text")),
  );
};

export const executeTranslation = ({ request, sampleCount }: TranslationInput) =>
  Effect.gen(function* () {
    const config = yield* AppConfigService;
    const clipboard = yield* Clipboard;

    const iterations = Array.from({ length: Math.max(sampleCount, 1) }, (_, index) => index);

    const translations = yield* Effect.forEach(
      iterations,
      () => runSingleTranslation(request, config),
      { batching: "inherit", concurrency: "unbounded" },
    );

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


```

```typescript
import * as LanguageModel from "@effect/ai/LanguageModel";
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
    LanguageModel.generate({
      prompt,
      toolChoice: "none",
    }),
    Effect.map((response) => response.text.trim()),
    Effect.filterOrFail((text) => text.length > 0, () => new Error("Language model returned empty text")),
  );
};

export const executeTranslation = ({ request, sampleCount }: TranslationInput) =>
  Effect.gen(function* () {
    const config = yield* AppConfigService;
    const clipboard = yield* Clipboard;

    const iterations = Array.from({ length: Math.max(sampleCount, 1) }, (_, index) => index);

    const translations = yield* Effect.forEach(
      iterations,
      () => runSingleTranslation(request, config),
      { batching: "inherit", concurrency: "unbounded" },
    );

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


```

```typescript
*** Begin Patch
*** Update File: src/application/translation.ts
@@
-import * as LanguageModel from "@effect/ai/LanguageModel";
+import { generateText } from "@effect/ai/LanguageModel";
@@
-  return pipe(
-    LanguageModel.generateText({
+  return pipe(
+    generateText({
*** End Patch
```

```typescript
import { generateText } from "@effect/ai/LanguageModel";
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
    Effect.map((response) => response.text.trim()),
    Effect.filterOrFail((text) => text.length > 0, () => new Error("Language model returned empty text")),
  );
};

export const executeTranslation = ({ request, sampleCount }: TranslationInput) =>
  Effect.gen(function* () {
    const config = yield* AppConfigService;
    const clipboard = yield* Clipboard;

    const iterations = Array.from({ length: Math.max(sampleCount, 1) }, (_, index) => index);

    const translations = yield* Effect.forEach(
      iterations,
      () => runSingleTranslation(request, config),
      { batching: "inherit", concurrency: "unbounded" },
    );

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


```

- 번역 파이프라인에서 `LanguageModel.Service.generateText`를 잘못 참조해 의존성이 주입되지 않은 상태에서 메서드를 호출하면서 런타임 오류가 발생했어. `@effect/ai/LanguageModel`가 제공하는 헬퍼 함수 `generateText`를 직접 import해 사용하도록 수정했어.
- `runSingleTranslation`는 이제 `generateText` 호출 결과를 그대로 받아 텍스트를 추출하므로 LanguageModel 서비스가 정상적으로 제공되면 오류 없이 실행돼.

```26:35:src/application/translation.ts
import { generateText } from "@effect/ai/LanguageModel";
...
  return pipe(
    generateText({
      prompt,
      toolChoice: "none",
    }),
    Effect.map((response) => response.text.trim()),
    Effect.filterOrFail((text) => text.length > 0, () => new Error("Language model returned empty text")),
  );
```

## 테스트
- 실행하지 않음 (LLM 호출에 실 키 필요).

```typescript
import { generateText } from "@effect/ai/LanguageModel";
...
  return pipe(
    generateText({
      prompt,
      toolChoice: "none",
    }),
    Effect.map((response) => response.text.trim()),
    Effect.filterOrFail((text) => text.length > 0, () => new Error("Language model returned empty text")),
  );
```

---

**User**

@README.md (76-77) --prompt 명령의 행동을 변경한다. 현재 선택된 시스템 프롬프트를 상세한 세팅(temperature ...)과 함께 출력하라.

---

**Cursor**

```typescript
import { Prompt } from "@effect/ai";
import type { AppConfig, ProfileConfig } from "./config";
import type { TranslationRequest } from "./translationRequest";

export const buildSystemMessage = (request: TranslationRequest, config: AppConfig, profile: ProfileConfig) => {
  const sections = [
    `You are a bilingual assistant that translates ${config.translation.source.toUpperCase()} engineering requirements into concise ${request.targetLanguage.toUpperCase()} instructions.`,
    config.translation.formatter,
    `Persona directive: ${request.persona.system}`,
  ];

  if (profile.styleHint) {
    sections.push(`Style hint: ${profile.styleHint}`);
  }

  return sections.join("\n\n");
};

const buildUserMessage = (request: TranslationRequest, config: AppConfig) => {
  const lines = [
    `Source language (${config.translation.source}):`,
    request.sourceText,
    "",
    "Respond with the translated instruction only.",
  ];
  return lines.join("\n");
};

export const buildTranslationPrompt = (request: TranslationRequest, config: AppConfig, profile: ProfileConfig) =>
  Prompt.make([
    {
      role: "system",
      content: buildSystemMessage(request, config, profile),
    },
    {
      role: "user",
      content: buildUserMessage(request, config),
    },
  ]);


```

```typescript
import { Args, Command, HelpDoc, Options, Prompt } from "@effect/cli";
import * as ValidationError from "@effect/cli/ValidationError";
import * as FileSystem from "@effect/platform/FileSystem";
import { Effect, Layer, Option } from "effect";
import * as Redacted from "effect/Redacted";
import { AppConfigService, DEFAULT_TRANSLATION_FORMATTER, defaultProfiles } from "./domain/config";
import type { ProviderName } from "./domain/config";
import { personaKeys, requirePersona } from "./domain/persona";
import type { PersonaKey } from "./domain/persona";
import { buildSystemMessage } from "./domain/prompt";
import { makeTranslationRequest } from "./domain/translationRequest";
import type { TranslationRequest } from "./domain/translationRequest";
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
  Options.withDescription("Show the resolved config that main loads from the XDG path"),
);

const promptInfoOption = Options.boolean("prompt").pipe(
  Options.withDescription("Print the current system prompt and persona settings"),
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

      const targetLanguage = (Option.getOrUndefined(lang) ?? configData.translation.target).trim();

      if (promptInfo) {
        const systemRequest: TranslationRequest = {
          sourceText: "",
          persona: personaProfile,
          targetLanguage,
        };
        const systemMessage = buildSystemMessage(systemRequest, configData, profile!);
        printPromptDetails({
          persona: personaProfile,
          profile: profile!,
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
  readonly persona: ReturnType<typeof requirePersona> extends Effect.Effect<infer A, any, any> ? A : never;
  readonly profile: (typeof defaultProfiles)[PersonaKey];
  readonly config: Awaited<ReturnType<typeof loadConfig>>;
  readonly targetLanguage: string;
  readonly systemMessage: string;
}) => {
  console.log(`[persona] ${persona.key} — ${persona.title}`);
  console.log(`[target language] ${targetLanguage}`);
  console.log(`[temperature] ${profile.temperature}`);
  console.log(`[maxTokens] ${profile.maxTokens ?? "provider default"}`);
  console.log(`[styleHint] ${profile.styleHint ?? "none"}`);
  console.log(
    `[translation settings] source=${config.translation.source} autoCopy=${config.translation.autoCopyToClipboard ? "on" : "off"}`,
  );
  console.log(`[formatter]
${config.translation.formatter}`);
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
  Options.withDescription("Show the resolved config that main loads from the XDG path"),
);

const promptInfoOption = Options.boolean("prompt").pipe(
  Options.withDescription("Print the current system prompt and persona settings"),
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

      const targetLanguage = (Option.getOrUndefined(lang) ?? configData.translation.target).trim();

      if (promptInfo) {
        const systemRequest: TranslationRequest = {
          sourceText: "",
          persona: personaProfile,
          targetLanguage,
        };
        const systemMessage = buildSystemMessage(systemRequest, configData, profile!);
        printPromptDetails({
          persona: personaProfile,
          profile: profile!,
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
  readonly persona: ReturnType<typeof requirePersona> extends Effect.Effect<infer A, any, any> ? A : never;
  readonly profile: (typeof defaultProfiles)[PersonaKey];
  readonly config: Awaited<ReturnType<typeof loadConfig>>;
  readonly targetLanguage: string;
  readonly systemMessage: string;
}) => {
  console.log(`[persona] ${persona.key} — ${persona.title}`);
  console.log(`[target language] ${targetLanguage}`);
  console.log(`[temperature] ${profile.temperature}`);
  console.log(`[maxTokens] ${profile.maxTokens ?? "provider default"}`);
  console.log(`[styleHint] ${profile.styleHint ?? "none"}`);
  console.log(
    `[translation settings] source=${config.translation.source} autoCopy=${config.translation.autoCopyToClipboard ? "on" : "off"}`,
  );
  console.log(`[formatter]
${config.translation.formatter}`);
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
  Options.withDescription("Show the resolved config that main loads from the XDG path"),
);

const promptInfoOption = Options.boolean("prompt").pipe(
  Options.withDescription("Print the current system prompt and persona settings"),
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
  readonly persona: ReturnType<typeof requirePersona> extends Effect.Effect<infer A, any, any> ? A : never;
  readonly profile: (typeof defaultProfiles)[PersonaKey];
  readonly config: Awaited<ReturnType<typeof loadConfig>>;
  readonly targetLanguage: string;
  readonly systemMessage: string;
}) => {
  console.log(`[persona] ${persona.key} — ${persona.title}`);
  console.log(`[target language] ${targetLanguage}`);
  console.log(`[temperature] ${profile.temperature}`);
  console.log(`[maxTokens] ${profile.maxTokens ?? "provider default"}`);
  console.log(`[styleHint] ${profile.styleHint ?? "none"}`);
  console.log(
    `[translation settings] source=${config.translation.source} autoCopy=${config.translation.autoCopyToClipboard ? "on" : "off"}`,
  );
  console.log(`[formatter]
${config.translation.formatter}`);
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
  Options.withDescription("Show the resolved config that main loads from the XDG path"),
);

const promptInfoOption = Options.boolean("prompt").pipe(
  Options.withDescription("Print the current system prompt and persona settings"),
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
  console.log(`[persona] ${persona.key} — ${persona.title}`);
  console.log(`[target language] ${targetLanguage}`);
  console.log(`[temperature] ${profile.temperature}`);
  console.log(`[maxTokens] ${profile.maxTokens ?? "provider default"}`);
  console.log(`[styleHint] ${profile.styleHint ?? "none"}`);
  console.log(
    `[translation settings] source=${config.translation.source} autoCopy=${config.translation.autoCopyToClipboard ? "on" : "off"}`,
  );
  console.log(`[formatter]
${config.translation.formatter}`);
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
  Options.withDescription("Show the resolved config that main loads from the XDG path"),
);

const promptInfoOption = Options.boolean("prompt").pipe(
  Options.withDescription("Print the current system prompt and persona settings"),
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
  console.log(`[persona] ${persona.key} — ${persona.title}`);
  console.log(`[target language] ${targetLanguage}`);
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

```markdown
# tsl: Translator in console

한국어 프롬프트를 자동으로 영어로 번역해 콘솔 정확도를 높이고, 번역 결과를 클립보드에 복사한 뒤 여러 LLM 제공자(OpenAI, Gemini, OpenRouter 등)에 전달하는 Bun 기반 CLI입니다. `effect-ts`로 부작용을 제어하고, YAML 설정 파일을 통해 모델·키·프롬프트 전략을 관리합니다.

## 주요 특징
- Bun + TypeScript + effect-ts 기반의 경량 CLI
- 한국어 입력 → 영어 번역 → 클립보드 복사 → 선택한 모델 호출까지 일괄 처리
- Provider 다중 선택 지원(OpenAI, OpenRouter, Gemini 등) 및 모델별 설정
- `tsl programming:en` 같은 도메인 프리셋으로 일관된 프롬프트 스타일 제공
- `--length` 옵션으로 다중 예제(샘플) 생성

## 시스템 요구 사항
- Bun >= 1.3
- TypeScript >= 5.8
- effect-ts, @effect/platform, @effect/ai for OpenAI/Gemini/OpenRouter SDK
- macOS 14+ (클립보드 제어 및 번역 툴링 확인용)

## 설치
[@effect/cli](https://github.com/Effect-TS/effect/tree/main/packages/cli) 패키지를 사용하고, `bun build --compile` 을 통해 단독 실행 파일을 제공함(node/bun 불필요)

```bash
# 1) 저장소 클론
git clone https://github.com/your-org/tsl.git
cd tsl

# 2) 의존성 설치
bun install

# 3) 첫 실행 전 초기화
bun run tsl --init
```

## 설정(YAML)
`npm start -- --init` 또는 `bun run tsl --init` 명령은 프로젝트 루트에 `~/.config/tsl.config.yaml`을 생성합니다. 수동 작성 예시는 아래와 같습니다.

```yaml
# tsl.config.yaml
providers:
  - name: openai
    apiKey: sk-...
    model: gpt-4.1-mini
  - name: gemini
    apiKey: g-...
    model: gemini-1.5-pro
  - name: openrouter
    apiKey: or-...
    model: meta-llama/llama-3-70b-instruct

translation:
  source: ko
  target: en
  autoCopyToClipboard: true
  formatter: >
    Please convert the Korean prompt into concise English that coding agents
    understand. Keep imperative mood.

profiles:
  default:
    temperature: 0.4
    maxTokens: 1024
  programming:
    temperature: 0.2
    styleHint: |
      Emphasize reproducible steps and include code if needed.
```

## 명령어

| 명령 | 설명 |
| ---- | ---- |
| `tsl --init` | 모델/키 선택 및 YAML 설정 파일 생성 |
| `tsl --config` | 현재 설정 파일 내용 확인 |
| `tsl --load-show` | main 프로그램이 로드한 설정 내용 확인 |
| `tsl --lang en "어쩌구 저쩌구"` | 단일 메시지 target 언어(en)로 번역 및 출력/클립보드 복사 |
| `tsl --persona programming --lang en "어쩌구 저쩌구"` | `programming` 프로필을 강제하고 target 언어(en)로 결과를 출력 |
| `tsl --prompt` | 선택 페르소나의 시스템 프롬프트와 temperature/maxTokens 등 세팅 출력 |
| `tsl` | 인터랙티브 프롬프트 모드로 진입 |
| `tsl "어쩌구 저쩌구"` | 프롬프트 기반 target 언어로 번역 및 출력 |
| `tsl "어쩌구 저쩌구" --length 5` | 동일 프롬프트 기반 예제 5개 생성 출력|

### 사용 흐름
1. 사용자는 콘솔에서 한국어 프롬프트를 입력합니다.
2. CLI가 번역 프롬프트 템플릿과 effect-ts 파이프라인을 통해 영어로 변환합니다.
3. 번역된 결과는 클립보드에 자동 저장됩니다.
4. 선택된 Provider로 API 요청을 보내 응답을 출력/저장합니다.

## 개발 노트
- `effect-ts`는 번역 → 클립보드 → 모델 호출 단계를 순차적 Effect로 모델링하여 오류 처리를 단순화합니다.
- Provider 확장은 `providers/` 디렉터리에 드라이버를 추가하고 YAML에 매핑하면 됩니다.
- 테스트는 effect-ts mock layer를 이용해 번역/클립보드/HTTP를 분리해 작성합니다.

## Roadmap
- Provider 연결 상태 자동 점검(`tsl --doctor`)
- Prompt 템플릿 버전 관리 및 공유
- Git 훅과 연동하여 커밋 메시지 번역 자동화
- TSL 서버 모드(WebSocket)로 번역 결과 스트리밍

## 보안 & 운영
- API 키는 `.env` 또는 macOS Keychain에 저장하고 `tsl.config.yaml`에서는 `${ENV:VAR}` 형태로 참조합니다.
- 번역 및 모델 호출 로그에는 민감한 값을 남기지 않으며, 필요 시 `--redact` 옵션을 도입합니다.
- CLI 실행 결과를 팀과 공유할 때는 익명화된 prompt history만 사용합니다.

## 기여
1. 이슈 또는 제안 등록
2. 기능 브랜치에서 작업 후 PR 제출
3. Bun test, lint, typecheck 통과 여부를 CI에서 확인

본 README는 프로젝트 초기 기획용 문서이며, 구현이 진행되면서 세부 내용이 업데이트될 예정입니다.


```

- `tsl --prompt` 옵션을 새로 정의하고, 설정 로드·페르소나 해석 이후에 시스템 프롬프트만 출력하도록 분기했어. 번역 텍스트 입력은 이 옵션을 쓸 때 요구되지 않으며, 대상 언어·프로필을 반영한 system message를 `buildSystemMessage`로 생성해 보여준다.
```
20:118:src/cli-program.ts
const promptInfoOption = Options.boolean("prompt")...
...
if (promptInfo) {
  const systemRequest: TranslationRequest = { ... };
  const systemMessage = buildSystemMessage(...);
  printPromptDetails({ ... });
  return;
}
```

- 세부 정보 출력을 담당하는 `printPromptDetails`는 persona, temperature, maxTokens, formatter, autoCopy 설정 등을 함께 로그로 보여줘서 README 요구사항을 충족한다.
```
214:230:src/cli-program.ts
const printPromptDetails = ({ persona, profile, config, targetLanguage, systemMessage }) => {
  console.log(`[persona] ${persona.key} — ${persona.title}`);
  console.log(`[temperature] ${profile.temperature}`);
  ...
  console.log("--- system prompt ---");
  console.log(systemMessage);
};
```

- 시스템 메시지를 재사용하려고 `buildSystemMessage`를 export 했고, README의 `tsl --prompt` 행을 “시스템 프롬프트 + temperature/maxTokens 등 세팅 출력”으로 갱신했어.
```
1:40:src/domain/prompt.ts
export const buildSystemMessage = (request, config, profile) => { ... }
```

테스트: `read_lints src/cli-program.ts src/domain/prompt.ts` 진행, 신규 린트 없음.

```plaintext
20:118:src/cli-program.ts
const promptInfoOption = Options.boolean("prompt")...
...
if (promptInfo) {
  const systemRequest: TranslationRequest = { ... };
  const systemMessage = buildSystemMessage(...);
  printPromptDetails({ ... });
  return;
}
```

```plaintext
214:230:src/cli-program.ts
const printPromptDetails = ({ persona, profile, config, targetLanguage, systemMessage }) => {
  console.log(`[persona] ${persona.key} — ${persona.title}`);
  console.log(`[temperature] ${profile.temperature}`);
  ...
  console.log("--- system prompt ---");
  console.log(systemMessage);
};
```

```plaintext
1:40:src/domain/prompt.ts
export const buildSystemMessage = (request, config, profile) => { ... }
```

