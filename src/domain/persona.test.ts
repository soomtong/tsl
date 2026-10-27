import { describe, expect, test } from 'bun:test';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import { isPersonaKey, PERSONA_PRESETS, requirePersona } from './persona';

describe('isPersonaKey', () => {
  test('accepts every built-in key and rejects the rest', () => {
    expect(isPersonaKey('programming')).toBe(true);
    expect(isPersonaKey('review')).toBe(true);
    expect(isPersonaKey('Programming')).toBe(false);
    expect(isPersonaKey('')).toBe(false);
  });
});

describe('requirePersona', () => {
  test('returns the matching preset', async () => {
    const preset = await Effect.runPromise(requirePersona('research'));
    expect(preset).toBe(PERSONA_PRESETS.research);
  });

  test('fails with ConfigError for an unknown key', async () => {
    const exit = await Effect.runPromiseExit(requirePersona('poet'));

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain('Unknown persona: poet');
    }
  });
});
