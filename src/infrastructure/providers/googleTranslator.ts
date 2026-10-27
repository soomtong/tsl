import * as OpenAiClient from '@effect/ai-openai-compat/OpenAiClient';
import * as OpenAiLanguageModel from '@effect/ai-openai-compat/OpenAiLanguageModel';
import * as FetchHttpClient from 'effect/http/FetchHttpClient';
import * as Layer from 'effect/Layer';
import * as Redacted from 'effect/Redacted';
import type { ProviderConfig } from '../../domain/config';

const GOOGLE_OPENAI_COMPAT_URL =
  'https://generativelanguage.googleapis.com/v1beta/openai';

export const buildGoogleTranslatorLayer = (provider: ProviderConfig) =>
  OpenAiLanguageModel.layer({ model: provider.model }).pipe(
    Layer.provide(
      OpenAiClient.layer({
        apiKey: Redacted.make(provider.apiKey),
        apiUrl: provider.apiUrl ?? GOOGLE_OPENAI_COMPAT_URL,
      }).pipe(Layer.provide(FetchHttpClient.layer)),
    ),
  );
