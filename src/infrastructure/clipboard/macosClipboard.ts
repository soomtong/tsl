import * as Layer from "effect/Layer";
import * as Effect from "effect/Effect";
import { Clipboard } from "../../application/ports/clipboard";

const copyToClipboard = (text: string) =>
  Effect.try({
    try: () => {
      const inputBuffer = new TextEncoder().encode(text);

      const result = Bun.spawnSync(["/usr/bin/pbcopy"], {
        stdin: inputBuffer,
        stdout: "ignore",
        stderr: "pipe",
      });

      if (result.exitCode !== 0) {
        const stderr = result.stderr ? new TextDecoder().decode(result.stderr).trim() : "unknown error";
        throw new Error(`pbcopy failed: ${stderr}`);
      }
    },
    catch: (error) => (error instanceof Error ? error : new Error(String(error))),
  });

export const MacosClipboardLayer = Layer.succeed(Clipboard, {
  copy: copyToClipboard,
});
