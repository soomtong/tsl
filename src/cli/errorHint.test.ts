import { describe, expect, test } from 'bun:test';
import { AiError } from 'effect/ai';
import { errorHint } from './errorHint';

describe('errorHint', () => {
  test('suggests doctor for authentication failures', () => {
    const error = new AiError.AiError({
      module: 'OpenRouter',
      method: 'createChatCompletion',
      reason: new AiError.AuthenticationError({ kind: 'InvalidKey' }),
    });

    expect(errorHint(error)).toContain('tsl --doctor');
  });

  test('ignores unrelated errors', () => {
    expect(errorHint(new Error('network down'))).toBeUndefined();
  });
});
