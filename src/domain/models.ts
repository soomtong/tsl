import type { ProviderName } from './config';

export const DEFAULT_MODELS = {
  openai: 'gpt-6-luna',
  google: 'gemini-3.8-flash',
  openrouter: 'tencent/hy-mt2-1.8b',
} as const satisfies Record<ProviderName, string>;
