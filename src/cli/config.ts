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
    { title: "google", value: "google", description: "Use Google Gemini endpoints" },
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
    const yaml = Bun.YAML.stringify(config, null, 2);
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
    console.log(content);
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
      model: provider === "openai" ? "gpt-4o-mini" : "gemini-2.5-flash",
    },
  ],
  translation: {
    source: "Korean",
    target: "English",
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
