import { describe, expect, test } from 'bun:test';
import type { AppConfig } from '../domain/config';
import {
  DEFAULT_PROFILES,
  DEFAULT_TRANSLATION_SECTION,
} from '../domain/config';
import { redactConfig } from './inspect';

const config: AppConfig = {
  providers: [
    { name: 'openai', apiKey: 'sk-secret', model: 'gpt-4o-mini' },
    { name: 'google', apiKey: '', model: 'gemini-2.5-flash' },
  ],
  translation: DEFAULT_TRANSLATION_SECTION,
  profiles: DEFAULT_PROFILES,
  preferredPersona: 'programming',
};

describe('redactConfig', () => {
  test('masks non-empty api keys and keeps the rest intact', () => {
    const redacted = redactConfig(config);

    expect(redacted.providers.map((provider) => provider.apiKey)).toEqual([
      '***',
      '',
    ]);
    expect(redacted.providers[0]?.model).toBe('gpt-4o-mini');
    expect(redacted.translation).toEqual(config.translation);
  });
});
