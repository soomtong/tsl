import * as FileSystem from "@effect/platform/FileSystem";
import { Effect } from "effect";
import { loadConfig } from "../infrastructure/config/configLoader";

export const showLoadedConfig = (path: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(path);
    if (!exists) {
      console.log(`⛔️ No saved config found at ${path}. Run --init first.`);
      return;
    }
    const config = yield* loadConfig(path);
    console.log(`--- resolved config (${path}) ---`);
    console.log(JSON.stringify(config, null, 2));
  }).pipe(
    Effect.catchAll((error) =>
      Effect.sync(() => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`⛔️ Failed to load config: ${message}`);
      }),
    ),
  );
