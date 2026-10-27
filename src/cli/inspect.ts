import * as Console from 'effect/Console';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import type { AppConfig } from '../domain/config';
import { loadConfig } from '../infrastructure/config/configLoader';

/** Masks every non-empty API key so the config can be printed safely. */
export function redactConfig(config: AppConfig): AppConfig {
  return {
    ...config,
    providers: config.providers.map((provider) => ({
      ...provider,
      apiKey: provider.apiKey.length > 0 ? '***' : '',
    })),
  };
}

/** Prints the config as the CLI resolves it (`--load-show`). */
export function showLoadedConfig(path: string) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(path);
    if (!exists) {
      yield* Console.log(
        `⛔️ No saved config found at ${path}. Run --init first.`,
      );
      return;
    }
    const config = yield* loadConfig(path);
    yield* Console.log(`--- resolved config (${path}) ---`);
    yield* Console.log(Bun.YAML.stringify(redactConfig(config), null, 2));
  }).pipe(
    Effect.catch((error) =>
      Console.error(`⛔️ Failed to load config: ${error.message}`),
    ),
  );
}
