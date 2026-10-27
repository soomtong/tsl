import * as Console from 'effect/Console';
import { Prompt } from 'effect/cli';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as Path from 'effect/Path';
import * as Redacted from 'effect/Redacted';
import type { AppConfig, ProviderName } from '../domain/config';
import {
  DEFAULT_PROFILES,
  DEFAULT_TRANSLATION_FORMATTER,
} from '../domain/config';
import { DEFAULT_MODELS } from '../domain/models';
import type { PersonaKey } from '../domain/persona';

interface InitAnswers {
  readonly provider: ProviderName;
  readonly apiKey: string;
  readonly preferredPersona: PersonaKey;
  readonly model?: string;
}

const providerPrompt = Prompt.Select<ProviderName>({
  message: 'Select provider',
  choices: [
    { title: 'openai', value: 'openai', description: 'Use OpenAI endpoints' },
    {
      title: 'google',
      value: 'google',
      description: 'Use Google Gemini endpoints',
    },
    {
      title: 'openrouter',
      value: 'openrouter',
      description: 'Use OpenRouter (400+ models)',
    },
  ],
});

const apiKeyPrompt = Prompt.Password({
  message: 'Enter API key',
  validate: (value) => {
    const trimmed = value.trim();
    return trimmed.length === 0
      ? Effect.fail('API key cannot be empty')
      : Effect.succeed(trimmed);
  },
});

// biome-ignore lint/suspicious/noTemplateCurlyInString: literal config reference syntax
const OPENROUTER_ENV_REFERENCE = '${ENV:OPENROUTER_API_KEY}';

const openrouterKeySourcePrompt = Prompt.Select<'env' | 'direct'>({
  message: 'OpenRouter API key source',
  choices: [
    {
      title: 'env reference',
      value: 'env',
      description: `Store ${OPENROUTER_ENV_REFERENCE} (key stays in your environment)`,
    },
    {
      title: 'enter key',
      value: 'direct',
      description: 'Write the key into config.yaml',
    },
  ],
});

const openrouterModelPrompt = Prompt.Select<string>({
  message: 'Select OpenRouter model',
  choices: [
    // Translation-specialized models (cheap and fast, 8k context)
    {
      title: 'Hunyuan MT2 1.8B',
      value: DEFAULT_MODELS.openrouter,
      description:
        'Default; translation-specialized, cheapest and fastest; 8k context',
    },
    {
      title: 'Hunyuan MT2 7B',
      value: 'tencent/hy-mt2-7b',
      description: 'Translation-specialized; higher quality; 8k context',
    },
    {
      title: 'Hunyuan MT2 30B-A3B',
      value: 'tencent/hy-mt2-30b-a3b',
      description: 'Translation-specialized MoE; 8k context',
    },
    // Low-cost paid general models (USD per 1M input/output tokens, verified against https://openrouter.ai/api/v1/models)
    {
      title: 'Qwen3.7 Flash',
      value: 'qwen/qwen3.7-flash',
      description: '$0.03/$0.13; 1M context',
    },
    {
      title: 'Gemma 3 12B',
      value: 'google/gemma-3-12b-it',
      description: '$0.05/$0.15; 131k context',
    },
    {
      title: 'GPT-5 Nano',
      value: 'openai/gpt-5-nano',
      description: '$0.05/$0.40; 400k context',
    },
    // Other low-cost models (flagship models are intentionally excluded)
    {
      title: 'GPT-6 Luna',
      value: 'openai/gpt-6-luna',
      description: 'Fast, low-cost OpenAI; 1M context',
    },
    {
      title: 'Claude Haiku 5.5',
      value: 'anthropic/claude-haiku-5.5',
      description: 'Fast, affordable Claude',
    },
    {
      title: 'DeepSeek V4.1 Flash',
      value: 'deepseek/deepseek-v4.1-flash',
      description: 'Low-cost, high throughput',
    },
    // Free models (often slow; verified against https://openrouter.ai/api/v1/models)
    {
      title: 'Free Models Router (FREE)',
      value: 'openrouter/free',
      description: 'Auto-selects a free model; may be slow; 200k context',
    },
    {
      title: 'Flint 1.0 (FREE)',
      value: 'recursive/flint-v1.0:free',
      description: 'Newest free model; 262k context',
    },
    {
      title: 'Nemotron 3.5 Super VL (FREE)',
      value: 'nvidia/nemotron-3.5-super-vl:free',
      description: 'Free multimodal model; 1M context',
    },
    {
      title: 'Inkling (FREE)',
      value: 'thinkingmachines/inkling:free',
      description: 'Free reasoning model; 1M context',
    },
  ],
});

const preferredPersonaPrompt = Prompt.Select<PersonaKey>({
  message: 'Preferred persona',
  choices: [
    { title: 'default', value: 'default' },
    { title: 'programming', value: 'programming' },
    { title: 'research', value: 'research' },
    { title: 'review', value: 'review' },
  ],
});

function writeConfig(path: string, config: AppConfig) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const pathService = yield* Path.Path;
    yield* fs.makeDirectory(pathService.dirname(path), { recursive: true });
    yield* fs.writeFileString(path, Bun.YAML.stringify(config, null, 2));
  });
}

/** Prints the raw config file (`--config`), or a hint when it is missing. */
export function showConfigFile(path: string) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(path);
    if (!exists) {
      yield* Console.log(
        `No config found at ${path}. Use --init to create one.`,
      );
      return;
    }
    const content = yield* fs.readFileString(path);
    yield* Console.log(`--- ${path} ---`);
    yield* Console.log(content);
  });
}

function buildConfigFromAnswers({
  provider,
  apiKey,
  preferredPersona,
  model,
}: InitAnswers): AppConfig {
  return {
    providers: [
      {
        name: provider,
        apiKey,
        model: model ?? DEFAULT_MODELS[provider],
      },
    ],
    translation: {
      source: 'Korean',
      target: 'English',
      autoCopyToClipboard: true,
      formatter: DEFAULT_TRANSLATION_FORMATTER,
    },
    profiles: DEFAULT_PROFILES,
    preferredPersona,
  };
}

/** Interactive `--init`: asks for provider, key, model and persona. */
export function runInitFlow(path: string) {
  return Effect.gen(function* () {
    const provider = yield* providerPrompt;
    const useEnvReference =
      provider === 'openrouter' && (yield* openrouterKeySourcePrompt) === 'env';
    const apiKey = useEnvReference
      ? OPENROUTER_ENV_REFERENCE
      : Redacted.value(yield* apiKeyPrompt);

    // Only OpenRouter offers a model menu; the others use DEFAULT_MODELS.
    const model =
      provider === 'openrouter' ? yield* openrouterModelPrompt : undefined;

    const preferredPersona = yield* preferredPersonaPrompt;

    const config = buildConfigFromAnswers({
      provider,
      apiKey,
      preferredPersona,
      model,
    });

    yield* writeConfig(path, config);
    yield* Console.log(`✅ Configuration written to ${path}`);
  });
}
