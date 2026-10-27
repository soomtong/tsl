import * as Effect from 'effect/Effect';
import { Stdio } from 'effect/Stdio';
import * as Stream from 'effect/Stream';
import { Clipboard } from '../application/ports/clipboard';
import { TranslationError } from '../domain/errors';
import { promptInput } from './options';

const readStdin = Effect.gen(function* () {
  const stdio = yield* Stdio;
  const text = yield* stdio.stdin.pipe(Stream.decodeText, Stream.mkString);
  return text.trim();
});

const nonEmpty = (source: string, text: string) =>
  text.length > 0
    ? Effect.succeed(text)
    : Effect.fail(
        new TranslationError({
          message: `${source} is empty; nothing to translate`,
        }),
      );

// Argument tokens are shell-parsed (`?`, `!`, `;` ...), so clipboard and piped stdin exist as shell-free input paths.
export const resolveSourceText = (options: {
  readonly tokens: ReadonlyArray<string>;
  readonly fromClipboard: boolean;
}) =>
  Effect.gen(function* () {
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
