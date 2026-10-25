import * as Console from "effect/Console";
import { Prompt } from "effect/cli";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Redacted from "effect/Redacted";
import type { AppConfig, ProviderName } from "../domain/config";
import { DEFAULT_TRANSLATION_FORMATTER, defaultProfiles } from "../domain/config";
import type { PersonaKey } from "../domain/persona";

const providerPrompt = Prompt.Select<ProviderName>({
  message: "Select provider",
  choices: [
    { title: "openai", value: "openai", description: "Use OpenAI endpoints" },
    { title: "google", value: "google", description: "Use Google Gemini endpoints" },
    { title: "openrouter", value: "openrouter", description: "Use OpenRouter (400+ models)" },
  ],
});

const apiKeyPrompt = Prompt.Password({
  message: "Enter API key",
  validate: (value) => {
    const trimmed = value.trim();
    return trimmed.length === 0 ? Effect.fail("API key cannot be empty") : Effect.succeed(trimmed);
  },
});

const openrouterModelPrompt = Prompt.Select<string>({
  message: "Select OpenRouter model",
  choices: [
    // Free models
    { title: "sherlock-dash-alpha (FREE)", value: "openrouter/sherlock-dash-alpha", description: "Fast, free model" },
    { title: "sherlock-think-alpha (FREE)", value: "openrouter/sherlock-think-alpha", description: "Reasoning model, free" },
    // Popular paid models
    { title: "Claude Sonnet 4.5", value: "anthropic/claude-sonnet-4.5", description: "High performance model" },
    { title: "GPT-5 Pro", value: "openai/gpt-5-pro", description: "Latest OpenAI flagship" },
    { title: "GPT-5.1", value: "openai/gpt-5.1", description: "Advanced GPT-5 variant" },
    { title: "Gemini 2.5 Flash", value: "google/gemini-2.5-flash-preview-09-2025", description: "Fast Google model" },
    { title: "DeepSeek V3.1 Terminus", value: "deepseek/deepseek-v3.1-terminus", description: "DeepSeek flagship" },
    { title: "Qwen3 Next 80B", value: "qwen/qwen3-next-80b-a3b-instruct", description: "Alibaba's large model" },
    { title: "Claude Haiku 4.5", value: "anthropic/claude-haiku-4.5", description: "Fast, affordable Claude" },
    { title: "Kimi K2 Thinking", value: "moonshotai/kimi-k2-thinking", description: "Moonshot reasoning model" },
    { title: "Grok 4 Fast", value: "x-ai/grok-4-fast", description: "X.AI fast model" },
    { title: "Qwen3 Max", value: "qwen/qwen3-max", description: "Alibaba's max model" },
    { title: "GPT-5 Codex", value: "openai/gpt-5-codex", description: "Code-specialized GPT-5" },
    { title: "Nova Premier V1", value: "amazon/nova-premier-v1", description: "Amazon's premier model" },
    { title: "GLM 4.6", value: "z-ai/glm-4.6", description: "Zhipu AI model" },
  ],
});

const preferredPersonaPrompt = Prompt.Select<PersonaKey>({
  message: "Preferred persona",
  choices: [
    { title: "default", value: "default" },
    { title: "programming", value: "programming" },
    { title: "research", value: "research" },
    { title: "review", value: "review" },
  ],
});

const writeConfig = (path: string, config: AppConfig) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const pathService = yield* Path.Path;
    yield* fs.makeDirectory(pathService.dirname(path), { recursive: true });
    yield* fs.writeFileString(path, Bun.YAML.stringify(config, null, 2));
  });

export const showConfigFile = (path: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(path);
    if (!exists) {
      yield* Console.log(`No config found at ${path}. Use --init to create one.`);
      return;
    }
    const content = yield* fs.readFileString(path);
    yield* Console.log(`--- ${path} ---`);
    yield* Console.log(content);
  });

const buildConfigFromPrompts = ({
  provider,
  apiKey,
  preferredPersona,
  model,
}: {
  readonly provider: ProviderName;
  readonly apiKey: string;
  readonly preferredPersona: PersonaKey;
  readonly model?: string;
}): AppConfig => {
  const defaultModel =
    provider === "openai" ? "gpt-4o-mini" : provider === "google" ? "gemini-2.5-flash" : "openrouter/sherlock-dash-alpha";

  return {
    providers: [
      {
        name: provider,
        apiKey,
        model: model ?? defaultModel,
      },
    ],
    translation: {
      source: "Korean",
      target: "English",
      autoCopyToClipboard: true,
      formatter: DEFAULT_TRANSLATION_FORMATTER,
    },
    profiles: defaultProfiles,
    preferredPersona,
  };
};

export const runInitFlow = (path: string) =>
  Effect.gen(function* () {
    const provider = yield* providerPrompt;
    const apiKey = yield* apiKeyPrompt;

    // If OpenRouter is selected, prompt for model selection
    const model = provider === "openrouter" ? yield* openrouterModelPrompt : undefined;

    const preferredPersona = yield* preferredPersonaPrompt;

    const config = buildConfigFromPrompts({
      provider,
      apiKey: Redacted.value(apiKey),
      preferredPersona,
      model,
    });

    yield* writeConfig(path, config);
    yield* Console.log(`✅ Configuration written to ${path}`);
  });
