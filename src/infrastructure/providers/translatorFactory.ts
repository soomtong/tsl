import type { LanguageModel } from 'effect/ai';
import type * as Layer from 'effect/Layer';
import type { ProviderConfig } from '../../domain/config';
import { buildGoogleTranslatorLayer } from './googleTranslator';
import { buildOpenAiTranslatorLayer } from './openaiTranslator';
import { buildOpenRouterTranslatorLayer } from './openrouterTranslator';

export const buildTranslatorLayer = (
  provider: ProviderConfig,
): Layer.Layer<LanguageModel.LanguageModel> => {
  switch (provider.name) {
    case 'openai':
      return buildOpenAiTranslatorLayer(provider);
    case 'google':
      return buildGoogleTranslatorLayer(provider);
    case 'openrouter':
      return buildOpenRouterTranslatorLayer(provider);
  }
};
