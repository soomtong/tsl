import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { Clipboard } from '../../application/ports/clipboard';
import { ClipboardError } from '../../domain/errors';

type PasteboardCommand = 'pbcopy' | 'pbpaste';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// The binary is resolved against the live PATH (`env: Bun.env`) so that the
// doctor check and the real copy/paste agree on which executable is used.
function runPasteboard(
  command: PasteboardCommand,
  stdin?: string,
): Effect.Effect<string, ClipboardError> {
  return Effect.gen(function* () {
    const result = yield* Effect.try({
      try: () =>
        Bun.spawnSync([command], {
          env: Bun.env,
          stdin:
            stdin === undefined ? 'ignore' : new TextEncoder().encode(stdin),
          stdout: 'pipe',
          stderr: 'pipe',
        }),
      catch: (error) =>
        new ClipboardError({
          message: `${command} failed: ${errorMessage(error)}`,
        }),
    });

    if (result.exitCode !== 0) {
      const stderr = new TextDecoder().decode(result.stderr).trim();
      return yield* new ClipboardError({
        message: `${command} failed: ${stderr || 'unknown error'}`,
      });
    }

    return new TextDecoder().decode(result.stdout);
  });
}

/** Clipboard backed by the macOS `pbcopy` / `pbpaste` binaries. */
export const macosClipboardLayer = Layer.succeed(Clipboard, {
  copy: (text: string) => Effect.asVoid(runPasteboard('pbcopy', text)),
  paste: runPasteboard('pbpaste'),
});
