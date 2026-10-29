import { BunRuntime, BunServices } from '@effect/platform-bun';
import * as Console from 'effect/Console';
import { CliError } from 'effect/cli';
import * as Effect from 'effect/Effect';
import * as FetchHttpClient from 'effect/http/FetchHttpClient';
import * as Layer from 'effect/Layer';
import { errorHint } from './cli/errorHint';
import { compactPresenterLayer } from './cli/presenter';
import { program } from './cli-program';

const reportFailure = Effect.catchIf(
  (error: unknown) => !CliError.isCliError(error),
  (error: unknown) => {
    const message = `⛔️ CLI failed: ${error instanceof Error ? error.message : String(error)}`;
    const hint = errorHint(error);
    return Console.error(hint ? `${message}\n힌트: ${hint}` : message).pipe(
      Effect.flatMap(() => Effect.fail(error)),
    );
  },
);

BunRuntime.runMain(
  program.pipe(
    Effect.provide(
      Layer.mergeAll(
        BunServices.layer,
        FetchHttpClient.layer,
        compactPresenterLayer,
      ),
    ),
    reportFailure,
  ),
  {
    disableErrorReporting: true,
  },
);
