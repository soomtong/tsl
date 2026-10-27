/**
 * Terminates a `switch` whose cases the type system has already exhausted.
 * Reaching it at runtime means a new union member was added without a case.
 */
export function unreachable(value: never): never {
  throw new Error(`Unreachable case: ${String(value)}`);
}
