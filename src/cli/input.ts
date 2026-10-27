import * as Effect from 'effect/Effect';
import { Stdio } from 'effect/Stdio';
import * as Stream from 'effect/Stream';
import { Clipboard } from '../application/ports/clipboard';
import { TranslationError } from '../domain/errors';
import { promptInput } from './options';

export interface SourceTextOptions {
  /** Positional CLI tokens; joined with single spaces. */
  readonly tokens: readonly string[];
  /** Read from the clipboard instead of arguments or stdin. */
  readonly fromClipboard: boolean;
}

const readStdin = Effect.gen(function* () {
  const stdio = yield* Stdio;
  const text = yield* stdio.stdin.pipe(Stream.decodeText, Stream.mkString);
  return text.trim();
});

function nonEmpty(
  source: string,
  text: string,
): Effect.Effect<string, TranslationError> {
  return text.length > 0
    ? Effect.succeed(text)
    : Effect.fail(
        new TranslationError({
          message: `${source} is empty; nothing to translate`,
        }),
      );
}

/**
 * Resolves the text to translate, in order: clipboard (when requested),
 * CLI tokens, an interactive prompt on a TTY, or piped stdin.
 *
 * Argument tokens are shell-parsed (`?`, `!`, `;` ...), so the clipboard and
 * stdin paths exist as shell-free alternatives.
 */
export function resolveSourceText(options: SourceTextOptions) {
  return Effect.gen(function* () {
    if (options.fromClipboard) {
      const clipboard = yield* Clipboard;
      const text = yield* clipboard.paste;
      return yield* nonEmpty('Clipboard', text.trim());
    }

    const tokenText = options.tokens.join(' ').trim();
    if (tokenText.length > 0) {
      return tokenText;
    }

    const stdio = yield* Stdio;
    if (yield* stdio.stdinIsTerminal) {
      return yield* promptInput;
    }
    return yield* nonEmpty('Stdin', yield* readStdin);
  });
}
