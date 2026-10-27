import * as OpenAiLanguageModel from '@effect/ai-openai/OpenAiLanguageModel';
import * as OpenAiCompatLanguageModel from '@effect/ai-openai-compat/OpenAiLanguageModel';
import * as OpenRouterLanguageModel from '@effect/ai-openrouter/OpenRouterLanguageModel';
import { LanguageModel } from 'effect/ai';
import type { Prompt } from 'effect/ai/Prompt';
import type * as Effect from 'effect/Effect';
import type { ProfileConfig, ProviderName } from '../../domain/config';

const applyProfile = <A, E, R>(
  provider: ProviderName,
  profile: ProfileConfig,
  effect: Effect.Effect<A, E, R>,
) => {
  switch (provider) {
    case 'openai':
      return effect.pipe(
        OpenAiLanguageModel.withConfigOverride({
          temperature: profile.temperature,
          max_output_tokens: profile.maxTokens,
        }),
      );
    case 'google':
      return effect.pipe(
        OpenAiCompatLanguageModel.withConfigOverride({
          temperature: profile.temperature,
          max_tokens: profile.maxTokens,
        }),
      );
    case 'openrouter':
      return effect.pipe(
        OpenRouterLanguageModel.withConfigOverride({
          temperature: profile.temperature,
          max_tokens: profile.maxTokens,
        }),
      );
  }
};

export const generateTextWithConfig = (
  provider: ProviderName,
  profile: ProfileConfig,
  prompt: Prompt,
) =>
  applyProfile(
    provider,
    profile,
    LanguageModel.generateText({ prompt, toolChoice: 'none' }),
  );
