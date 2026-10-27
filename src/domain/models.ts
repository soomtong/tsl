import type { ProviderName } from './config';

/** Model used when `--init` or the env fallback does not pick one. */
export const DEFAULT_MODELS = {
  openai: 'gpt-6-luna',
  google: 'gemini-3.8-flash',
  openrouter: 'tencent/hy-mt2-1.8b',
} as const satisfies Record<ProviderName, string>;

/** Base URL used when a provider entry omits `apiUrl`. */
export const DEFAULT_PROVIDER_URLS = {
  openai: 'https://api.openai.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta/openai',
  openrouter: 'https://openrouter.ai/api/v1',
} as const satisfies Record<ProviderName, string>;
