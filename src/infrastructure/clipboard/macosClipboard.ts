import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Clipboard } from "../../application/ports/clipboard";
import { ClipboardError } from "../../domain/errors";

const copyToClipboard = (text: string) =>
  Effect.gen(function* () {
    const result = yield* Effect.try({
      try: () =>
        Bun.spawnSync(["/usr/bin/pbcopy"], {
          stdin: new TextEncoder().encode(text),
          stdout: "ignore",
          stderr: "pipe",
        }),
      catch: (error) => new ClipboardError({ message: error instanceof Error ? error.message : String(error) }),
    });

    if (result.exitCode !== 0) {
      const stderr = result.stderr ? new TextDecoder().decode(result.stderr).trim() : "";
      return yield* new ClipboardError({ message: `pbcopy failed: ${stderr || "unknown error"}` });
    }
  });

export const MacosClipboardLayer = Layer.succeed(Clipboard, {
  copy: copyToClipboard,
});
