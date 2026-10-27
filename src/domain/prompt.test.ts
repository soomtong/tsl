import { describe, expect, test } from 'bun:test';
import type { AppConfig } from './config';
import { defaultProfiles, defaultTranslationSection } from './config';
import { PERSONA_PRESETS } from './persona';
import { buildSystemMessage } from './prompt';
import type { TranslationRequest } from './translationRequest';

const config: AppConfig = {
  providers: [{ name: 'openai', apiKey: 'test', model: 'gpt-4o-mini' }],
  translation: {
    ...defaultTranslationSection,
    formatter:
      'Please convert the Korean prompt into concise English that coding agents understand.',
  },
  profiles: defaultProfiles,
  preferredPersona: 'programming',
};

const request: TranslationRequest = {
  sourceText: '인증 시스템을 구현해주세요',
  persona: PERSONA_PRESETS.programming,
  targetLanguage: 'Japanese',
};

describe('buildSystemMessage', () => {
  test('replaces language references with the request target', () => {
    const message = buildSystemMessage(
      request,
      config,
      defaultProfiles.programming,
    );

    expect(message).toContain('concise JAPANESE instructions');
    expect(message).toContain('concise Japanese that coding agents understand');
    expect(message).not.toContain('English');
  });

  test('includes persona directive and style hint', () => {
    const message = buildSystemMessage(
      request,
      config,
      defaultProfiles.programming,
    );

    expect(message).toContain(PERSONA_PRESETS.programming.system);
    expect(message).toContain('Style hint: Emphasize reproducible steps');
  });

  test('omits style hint when the profile has none', () => {
    const message = buildSystemMessage(
      request,
      config,
      defaultProfiles.default,
    );

    expect(message).not.toContain('Style hint:');
  });
});
