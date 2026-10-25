import * as Console from "effect/Console";
import { Prompt } from "effect/cli";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Redacted from "effect/Redacted";
import type { AppConfig, ProviderName } from "../domain/config";
import { DEFAULT_TRANSLATION_FORMATTER, defaultProfiles } from "../domain/config";
import { DEFAULT_MODELS } from "../domain/models";
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
    // Free models (verified against https://openrouter.ai/api/v1/models)
    { title: "Free Models Router (FREE)", value: DEFAULT_MODELS.openrouter, description: "Auto-selects a free model; 200k context" },
    { title: "Flint 1.0 (FREE)", value: "recursive/flint-v1.0:free", description: "Newest free model; 262k context" },
    {
      title: "Nemotron 3.5 Super VL (FREE)",
      value: "nvidia/nemotron-3.5-super-vl:free",
      description: "Free multimodal model; 1M context",
    },
    { title: "Inkling (FREE)", value: "thinkingmachines/inkling:free", description: "Free reasoning model; 1M context" },
    // Current flagship / value models
    { title: "GPT-6.1 Sol", value: "openai/gpt-6.1-sol", description: "OpenAI flagship; 1M context" },
    { title: "GPT-6 Luna", value: "openai/gpt-6-luna", description: "Fast, low-cost OpenAI; 1M context" },
    { title: "Claude Sonnet 5.5", value: "anthropic/claude-sonnet-5.5", description: "Balanced Anthropic flagship" },
    { title: "Claude Haiku 5.5", value: "anthropic/claude-haiku-5.5", description: "Fast, affordable Claude" },
    { title: "Gemini 4 Argon", value: "google/gemini-4-argon", description: "Google flagship reasoning" },
    { title: "Gemini 3.8 Flash", value: "google/gemini-3.8-flash", description: "Fast Google model" },
    { title: "DeepSeek V4.1 Flash", value: "deepseek/deepseek-v4.1-flash", description: "Low-cost, high throughput" },
    { title: "Qwen3.8 Max Prime", value: "qwen/qwen3.8-max-prime", description: "Alibaba flagship" },
    { title: "Kimi K3.1 Pro", value: "moonshotai/kimi-k3.1-pro", description: "Moonshot flagship; 1M context" },
    { title: "GLM 5.3 Prime", value: "z-ai/glm-5.3-prime", description: "Z.ai flagship" },
    { title: "Grok 4.7", value: "x-ai/grok-4.7", description: "xAI flagship; 500k context" },
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
  const defaultModel = DEFAULT_MODELS[provider];

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
