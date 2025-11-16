import type { ProviderConfig } from "../../domain/config";
import { buildOpenAiTranslatorLayer } from "./openaiTranslator";
import { buildGoogleTranslatorLayer } from "./googleTranslator";
import { buildOpenRouterTranslatorLayer } from "./openrouterTranslator";

export const buildTranslatorLayer = (provider: ProviderConfig) => {
  switch (provider.name) {
    case "openai":
      return buildOpenAiTranslatorLayer(provider);
    case "google":
      return buildGoogleTranslatorLayer(provider);
    case "openrouter":
      return buildOpenRouterTranslatorLayer(provider);
    default:
      throw new Error(`Unsupported provider: ${provider.name}`);
  }
};
