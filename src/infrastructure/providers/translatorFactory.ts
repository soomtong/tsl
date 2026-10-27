import type { LanguageModel } from 'effect/ai';
import type * as Layer from 'effect/Layer';
import type { ProviderConfig } from '../../domain/config';
import { unreachable } from '../../domain/unreachable';
import { buildGoogleTranslatorLayer } from './googleTranslator';
import { buildOpenAiTranslatorLayer } from './openaiTranslator';
import { buildOpenRouterTranslatorLayer } from './openrouterTranslator';

/** Builds the `LanguageModel` layer for the configured provider. */
export function buildTranslatorLayer(
  provider: ProviderConfig,
): Layer.Layer<LanguageModel.LanguageModel> {
  switch (provider.name) {
    case 'openai':
      return buildOpenAiTranslatorLayer(provider);
    case 'google':
      return buildGoogleTranslatorLayer(provider);
    case 'openrouter':
      return buildOpenRouterTranslatorLayer(provider);
    default:
      return unreachable(provider.name);
  }
}
