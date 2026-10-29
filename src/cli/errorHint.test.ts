import { describe, expect, test } from 'bun:test';
import { AiError } from 'effect/ai';
import { HttpClientError, HttpClientRequest } from 'effect/http';
import { errorHint } from './errorHint';

function aiError(reason: AiError.AiError['reason']) {
  return new AiError.AiError({
    module: 'OpenRouter',
    method: 'createChatCompletion',
    reason,
  });
}

describe('errorHint', () => {
  test('suggests doctor for authentication failures', () => {
    const error = aiError(
      new AiError.AuthenticationError({ kind: 'InvalidKey' }),
    );

    expect(errorHint(error)).toContain('tsl --doctor');
  });

  test('surfaces the root cause of a network failure', () => {
    const socketError = Object.assign(
      new TypeError(
        'ECONNREFUSED: Unable to connect. Is the computer able to access the url?',
      ),
      { code: 'ECONNREFUSED' },
    );
    const transport = new HttpClientError.HttpClientError({
      reason: new HttpClientError.TransportError({
        request: HttpClientRequest.post('https://api.openrouter.ai/v1/chat'),
        cause: socketError,
      }),
    });
    const error = aiError(
      AiError.NetworkError.fromHttpClientError(
        transport as HttpClientError.HttpClientError & {
          readonly reason: HttpClientError.RequestError;
        },
      ),
    );

    const hint = errorHint(error);
    expect(hint).toContain('ECONNREFUSED: Unable to connect');
    expect(hint).toContain('apiUrl');
    expect(hint).toContain('tsl --doctor');
  });

  test('falls back to the description when no cause is attached', () => {
    const error = aiError(
      new AiError.NetworkError({
        reason: 'InvalidUrlError',
        method: 'POST',
        url: 'not a url',
        description: 'Invalid URL',
      }),
    );

    expect(errorHint(error)).toContain('원인: Invalid URL');
  });

  test('ignores unrelated errors', () => {
    expect(errorHint(new Error('network down'))).toBeUndefined();
  });
});
