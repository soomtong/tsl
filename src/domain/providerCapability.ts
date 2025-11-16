import type { ProviderName } from "./config";

/**
 * Provider capability definition
 * Defines which configuration parameters each provider supports
 */
export type ProviderCapability = {
  readonly supportsTemperature: boolean;
  readonly supportsMaxTokens: boolean;
  readonly supportsTopP: boolean;
};

/**
 * Provider capability registry
 * Maps provider names to their capabilities
 */
const providerCapabilities: Record<ProviderName, ProviderCapability> = {
  openai: {
    supportsTemperature: true,
    supportsMaxTokens: true,
    supportsTopP: true,
  },
  google: {
    // Google Gemini supports temperature, maxOutputTokens, and topP
    supportsTemperature: true,
    supportsMaxTokens: true,
    supportsTopP: true,
  },
  openrouter: {
    // OpenRouter uses OpenAI-compatible API and supports all standard parameters
    supportsTemperature: true,
    supportsMaxTokens: true,
    supportsTopP: true,
  },
};

/**
 * Get provider capability
 * Returns the capability definition for a given provider
 */
export const getProviderCapability = (provider: ProviderName): ProviderCapability => {
  const capability = providerCapabilities[provider];
  if (!capability) {
    throw new Error(`Unknown provider: ${provider}`);
  }
  return capability;
};

/**
 * Check if a provider supports a specific capability
 */
export const supportsTemperature = (provider: ProviderName): boolean =>
  getProviderCapability(provider).supportsTemperature;

export const supportsMaxTokens = (provider: ProviderName): boolean =>
  getProviderCapability(provider).supportsMaxTokens;

export const supportsTopP = (provider: ProviderName): boolean => getProviderCapability(provider).supportsTopP;
