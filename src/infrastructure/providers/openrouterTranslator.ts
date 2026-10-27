import * as OpenRouterClient from '@effect/ai-openrouter/OpenRouterClient';
import * as OpenRouterLanguageModel from '@effect/ai-openrouter/OpenRouterLanguageModel';
import * as FetchHttpClient from 'effect/http/FetchHttpClient';
import * as Layer from 'effect/Layer';
import * as Redacted from 'effect/Redacted';
import type { ProviderConfig } from '../../domain/config';

export const buildOpenRouterTranslatorLayer = (provider: ProviderConfig) =>
  OpenRouterLanguageModel.layer({ model: provider.model }).pipe(
    Layer.provide(
      OpenRouterClient.layer({
        apiKey: Redacted.make(provider.apiKey),
        apiUrl: provider.apiUrl,
      }).pipe(Layer.provide(FetchHttpClient.layer)),
    ),
  );
