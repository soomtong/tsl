import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';
import type { ClipboardError } from '../../domain/errors';

export interface ClipboardPort {
  readonly copy: (text: string) => Effect.Effect<void, ClipboardError>;
  readonly paste: Effect.Effect<string, ClipboardError>;
}

export class Clipboard extends Context.Service<Clipboard, ClipboardPort>()(
  'tsl/Clipboard',
) {}
