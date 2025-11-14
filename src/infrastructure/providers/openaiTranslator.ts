import { IdGenerator } from "@effect/ai/IdGenerator";
import * as FetchHttpClient from "@effect/platform/FetchHttpClient";
import * as OpenAiClient from "@effect/ai-openai/OpenAiClient";
import * as OpenAiLanguageModel from "@effect/ai-openai/OpenAiLanguageModel";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { ProviderConfig } from "../../domain/config";

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

