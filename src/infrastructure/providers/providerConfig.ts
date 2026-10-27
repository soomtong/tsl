import * as OpenAiLanguageModel from '@effect/ai-openai/OpenAiLanguageModel';
import * as OpenAiCompatLanguageModel from '@effect/ai-openai-compat/OpenAiLanguageModel';
import * as OpenRouterLanguageModel from '@effect/ai-openrouter/OpenRouterLanguageModel';
import { LanguageModel } from 'effect/ai';
import type { Prompt } from 'effect/ai/Prompt';
import type * as Effect from 'effect/Effect';
import type { ProfileConfig, ProviderName } from '../../domain/config';
import { unreachable } from '../../domain/unreachable';

// Each provider package exposes its own `withConfigOverride`, and the
// token-limit field is named differently per wire protocol.
function applyProfile<A, E, R>(
  provider: ProviderName,
  profile: ProfileConfig,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
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
    default:
      return unreachable(provider);
  }
}

/** Generates text with the profile's sampling settings applied. */
export function generateTextWithConfig(
  provider: ProviderName,
  profile: ProfileConfig,
  prompt: Prompt,
) {
  return applyProfile(
    provider,
    profile,
    LanguageModel.generateText({ prompt, toolChoice: 'none' }),
  );
}
