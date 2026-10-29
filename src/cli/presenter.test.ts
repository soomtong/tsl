import { describe, expect, test } from 'bun:test';
import { BunServices } from '@effect/platform-bun';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as FetchHttpClient from 'effect/http/FetchHttpClient';
import * as Layer from 'effect/Layer';
import { TestConsole } from 'effect/testing';
import { runCli } from '../cli-program';
import { compactPresenterLayer } from './presenter';

const testLayer = Layer.mergeAll(
  BunServices.layer,
  FetchHttpClient.layer,
  TestConsole.layer,
  compactPresenterLayer,
);

function run(args: readonly string[]) {
  return Effect.gen(function* () {
    const exit = yield* Effect.exit(runCli(args));
    const logs = yield* TestConsole.logLines;
    const errors = yield* TestConsole.errorLines;
    return {
      exit,
      output: logs.map(String).join('\n'),
      errors: errors.map(String).join('\n'),
    };
  }).pipe(Effect.provide(testLayer));
}

describe('compactPresenter', () => {
  test('prints only the error and usage on an invalid invocation', async () => {
    const { exit, output, errors } = await Effect.runPromise(run(['--bogus']));

    expect(Exit.isFailure(exit)).toBe(true);
    expect(output).toBe('');
    expect(errors).toContain('Unrecognized flag: --bogus');
    expect(errors).toContain('USAGE');
    expect(errors).toContain('tsl --help');
    expect(errors).not.toContain('--doctor');
  });

  test('keeps the full help for --help', async () => {
    const { exit, output } = await Effect.runPromise(run(['--help']));

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(output).toContain('FLAGS');
    expect(output).toContain('--doctor');
  });

  test('keeps the version banner for --version', async () => {
    const { output } = await Effect.runPromise(run(['--version']));

    expect(output).toMatch(/^tsl v\d+\.\d+\.\d+$/);
  });
});
