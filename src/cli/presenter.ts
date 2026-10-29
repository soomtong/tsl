import * as Console from 'effect/Console';
import { CliOutput } from 'effect/cli';
import * as Effect from 'effect/Effect';

/**
 * CLI output presenter that keeps the built-in `--help` and `--version`
 * rendering but, on an invalid invocation, prints only the errors and the
 * usage line. `tsl` is a single command, so the full help that the default
 * presenter prints would push the actual error off the screen.
 */
export const compactPresenter: CliOutput.Presenter = {
  present: (event) => {
    if (event._tag !== 'InvalidInvocation') {
      return CliOutput.defaultPresenter.present(event);
    }
    return Effect.gen(function* () {
      const formatter = yield* CliOutput.Formatter;
      const command = event.commandPath.join(' ');
      yield* Console.error(formatter.formatErrors(event.errors));
      yield* Console.error('');
      yield* Console.error(`USAGE\n  ${event.helpDoc.usage}`);
      yield* Console.error('');
      yield* Console.error(`Run \`${command} --help\` to list every flag.`);
    });
  },
};

/** Installs {@link compactPresenter} for the CLI runtime. */
export const compactPresenterLayer = CliOutput.layerPresenter(compactPresenter);
