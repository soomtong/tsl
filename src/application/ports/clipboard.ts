import * as Context from "effect/Context";
import * as Effect from "effect/Effect";

export interface ClipboardPort {
  readonly copy: (text: string) => Effect.Effect<void, Error>;
}

export class Clipboard extends Context.Tag("tsl/ClipboardPort")<Clipboard, ClipboardPort>() {}
