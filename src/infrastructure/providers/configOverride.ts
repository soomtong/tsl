import { generateText } from "@effect/ai/LanguageModel";
import type { Prompt } from "@effect/ai/Prompt";
import { withConfigOverride as withOpenAiConfigOverride } from "@effect/ai-openai/OpenAiLanguageModel";
import { Effect, pipe } from "effect";
import type { ProviderName, ProfileConfig } from "../../domain/config";
import { getProviderCapability } from "../../domain/providerCapability";
import { withGoogleConfigOverride } from "./googleConfigOverride";

/**
 * Provider-specific config override parameters
 */
type ConfigOverrideParams = {
  temperature?: number;
  maxTokens?: number;
};

/**
 * Build config override params based on provider capabilities
 * Only includes parameters that the provider supports
 */
const buildConfigParams = (provider: ProviderName, profile: ProfileConfig): ConfigOverrideParams => {
  const capability = getProviderCapability(provider);
  const params: ConfigOverrideParams = {};

  if (capability.supportsTemperature && profile.temperature !== undefined) {
    params.temperature = profile.temperature;
  }

  if (capability.supportsMaxTokens && profile.maxTokens !== undefined) {
    params.maxTokens = profile.maxTokens;
  }

  return params;
};

/**
 * Get provider-specific config override function
 * Returns a function that applies the appropriate config override based on provider
 */
const getConfigOverrideFunction = (provider: ProviderName, params: ConfigOverrideParams) => {
  switch (provider) {
    case "openai":
      return withOpenAiConfigOverride({
        temperature: params.temperature,
        max_output_tokens: params.maxTokens,
      });

    case "google":
      return withGoogleConfigOverride({
        temperature: params.temperature,
        maxOutputTokens: params.maxTokens,
      });

    default:
      // Unknown provider, return identity function
      return <A, E, R>(effect: Effect.Effect<A, E, R>) => effect;
  }
};

/**
 * Generate text with provider-specific config override
 * This function encapsulates the LLM call with appropriate configuration based on provider capabilities
 */
export const generateTextWithConfig = (provider: ProviderName, profile: ProfileConfig, prompt: Prompt) => {
  const params = buildConfigParams(provider, profile);
  const configOverride = getConfigOverrideFunction(provider, params);

  return pipe(
    generateText({ prompt, toolChoice: "none" }),
    configOverride,
  );
};
