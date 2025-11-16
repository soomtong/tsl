import * as IdGenerator from "@effect/ai/IdGenerator";
import * as FetchHttpClient from "@effect/platform/FetchHttpClient";
import * as OpenRouterClient from "@effect/ai-openrouter/OpenRouterClient";
import * as OpenRouterLanguageModel from "@effect/ai-openrouter/OpenRouterLanguageModel";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import type { ProviderConfig } from "../../domain/config";

export const buildOpenRouterTranslatorLayer = (provider: ProviderConfig) => {
  if (provider.name !== "openrouter") {
    throw new Error("OpenRouter translator requires a provider with name 'openrouter'");
  }

  const httpLayer = FetchHttpClient.layer;
  const clientLayer = Layer.provide(
    OpenRouterClient.layer({
      apiKey: Redacted.make(provider.apiKey),
      apiUrl: provider.apiUrl,
    }),
    httpLayer,
  );

  const modelLayer = Layer.provide(
    OpenRouterLanguageModel.layer({
      model: provider.model,
    }),
    clientLayer,
  );

  const idLayer = Layer.succeed(IdGenerator.IdGenerator, IdGenerator.defaultIdGenerator);

  return Layer.merge(modelLayer, idLayer);
};
