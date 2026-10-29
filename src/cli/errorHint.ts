import { AiError } from 'effect/ai';

const DOCTOR = '`tsl --doctor`';

/**
 * Walks the `cause` chain and returns the innermost error message, since
 * the outer layers (AiError → HttpClientError) only restate the request
 * while the leaf holds the real reason, e.g. `ECONNREFUSED: Unable to
 * connect`.
 */
function rootCauseMessage(cause: unknown): string | undefined {
  const seen = new Set<unknown>();
  let current = cause;
  let message: string | undefined;
  while (
    current !== null &&
    typeof current === 'object' &&
    !seen.has(current)
  ) {
    seen.add(current);
    if (current instanceof Error && current.message.length > 0) {
      message = current.message.split('\n')[0];
    }
    current = (current as { cause?: unknown }).cause;
  }
  return message;
}

/** Returns a remediation hint for known provider failures, if any. */
export function errorHint(error: unknown): string | undefined {
  if (!AiError.isAiError(error)) {
    return undefined;
  }

  const reason = error.reason;
  switch (reason._tag) {
    case 'AuthenticationError':
      return `API 키가 유효하지 않습니다. ${DOCTOR}로 확인하고 키를 재발급하세요.`;
    case 'NetworkError': {
      // Effect 4.1 keeps the failing HttpClientError as `cause`, so the
      // underlying reason (DNS, refused connection, TLS...) is available.
      const detail = rootCauseMessage(reason.cause) ?? reason.description;
      const suffix = detail ? ` (원인: ${detail})` : '';
      return `네트워크 연결과 config의 apiUrl을 확인하고 ${DOCTOR}를 실행하세요.${suffix}`;
    }
    default:
      return undefined;
  }
}
