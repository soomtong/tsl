import * as GoogleLanguageModel from "@effect/ai-google/GoogleLanguageModel";
import { Effect, Layer } from "effect";

/**
 * Google-specific config override
 * Applies generationConfig to the Google Gemini API
 */
export const withGoogleConfigOverride =
  (config: {
    readonly temperature?: number;
    readonly maxOutputTokens?: number;
  }) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> => {
    // Build generationConfig for Google API
    const generationConfig: Record<string, unknown> = {};

    if (config.temperature !== undefined) {
      generationConfig.temperature = config.temperature;
    }

    if (config.maxOutputTokens !== undefined) {
      generationConfig.maxOutputTokens = config.maxOutputTokens;
    }

    // If no config to override, return effect as-is
    if (Object.keys(generationConfig).length === 0) {
      return effect;
    }

    // Apply config override by providing a Config layer
    const configLayer = Layer.succeed(GoogleLanguageModel.Config, {
      generationConfig,
    });

    return Effect.provide(effect, configLayer);
  };
