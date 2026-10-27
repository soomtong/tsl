import * as OpenAiClient from '@effect/ai-openai-compat/OpenAiClient';
import * as OpenAiLanguageModel from '@effect/ai-openai-compat/OpenAiLanguageModel';
import * as FetchHttpClient from 'effect/http/FetchHttpClient';
import * as Layer from 'effect/Layer';
import * as Redacted from 'effect/Redacted';
import type { ProviderConfig } from '../../domain/config';
import { DEFAULT_PROVIDER_URLS } from '../../domain/models';

/** Gemini via its OpenAI-compatible endpoint. */
export function buildGoogleTranslatorLayer(provider: ProviderConfig) {
  return OpenAiLanguageModel.layer({ model: provider.model }).pipe(
    Layer.provide(
      OpenAiClient.layer({
        apiKey: Redacted.make(provider.apiKey),
        apiUrl: provider.apiUrl ?? DEFAULT_PROVIDER_URLS.google,
      }).pipe(Layer.provide(FetchHttpClient.layer)),
    ),
  );
}
