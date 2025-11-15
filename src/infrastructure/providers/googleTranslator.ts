import * as IdGenerator from "@effect/ai/IdGenerator";
import * as FetchHttpClient from "@effect/platform/FetchHttpClient";
import * as GoogleClient from "@effect/ai-google/GoogleClient";
import * as GoogleLanguageModel from "@effect/ai-google/GoogleLanguageModel";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import type { ProviderConfig } from "../../domain/config";

export const buildGoogleTranslatorLayer = (provider: ProviderConfig) => {
  if (provider.name !== "google") {
    throw new Error("Google translator requires a provider with name 'google'");
  }

  const httpLayer = FetchHttpClient.layer;
  const clientLayer = Layer.provide(
    GoogleClient.layer({
      apiKey: Redacted.make(provider.apiKey),
      apiUrl: provider.apiUrl,
    }),
    httpLayer,
  );

  const modelLayer = Layer.provide(
    GoogleLanguageModel.layer({
      model: provider.model,
    }),
    clientLayer,
  );

  const idLayer = Layer.succeed(IdGenerator.IdGenerator, IdGenerator.defaultIdGenerator);

  return Layer.merge(modelLayer, idLayer);
};
