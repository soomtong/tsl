import { BunRuntime, BunServices } from "@effect/platform-bun";
import * as Console from "effect/Console";
import { CliError } from "effect/cli";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import { program } from "./cli-program";

const reportFailure = Effect.catchIf(
  (error: unknown) => !CliError.isCliError(error),
  (error: unknown) =>
    Console.error(`⛔️ CLI failed: ${error instanceof Error ? error.message : String(error)}`).pipe(
      Effect.flatMap(() => Effect.fail(error)),
    ),
);

BunRuntime.runMain(program.pipe(Effect.provide(Layer.mergeAll(BunServices.layer, FetchHttpClient.layer)), reportFailure), {
  disableErrorReporting: true,
});
