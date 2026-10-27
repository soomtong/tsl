import * as OpenAiClient from '@effect/ai-openai/OpenAiClient';
import * as OpenAiLanguageModel from '@effect/ai-openai/OpenAiLanguageModel';
import * as FetchHttpClient from 'effect/http/FetchHttpClient';
import * as Layer from 'effect/Layer';
import * as Redacted from 'effect/Redacted';
import type { ProviderConfig } from '../../domain/config';

/** OpenAI via the Responses API. */
export function buildOpenAiTranslatorLayer(provider: ProviderConfig) {
  return OpenAiLanguageModel.layer({ model: provider.model }).pipe(
    Layer.provide(
      OpenAiClient.layer({
        apiKey: Redacted.make(provider.apiKey),
        apiUrl: provider.apiUrl,
      }).pipe(Layer.provide(FetchHttpClient.layer)),
    ),
  );
}
