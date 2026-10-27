import { AiError } from 'effect/ai';

export const errorHint = (error: unknown): string | undefined => {
  if (!AiError.isAiError(error)) {
    return undefined;
  }

  if (error.reason._tag === 'AuthenticationError') {
    return 'API 키가 유효하지 않습니다. `tsl --doctor`로 확인하고 키를 재발급하세요.';
  }

  return undefined;
};
