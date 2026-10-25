import { Argument, Flag, Prompt } from "effect/cli";
import * as Effect from "effect/Effect";
import { TranslationError } from "../domain/errors";
import { personaKeys } from "../domain/persona";

export const promptArg = Argument.String("prompt").pipe(
  Argument.variadic,
  Argument.optional,
  Argument.withDescription("Korean prompt; multiple arguments are joined with spaces"),
);

export const personaOption = Flag.Literals("persona", personaKeys).pipe(
  Flag.optional,
  Flag.withDescription("Selects the translation persona preset"),
);

export const langOption = Flag.String("lang").pipe(
  Flag.optional,
  Flag.withDescription("Override target language (default: config target)"),
);

export const lengthOption = Flag.Int("length").pipe(
  Flag.withDefault(1),
  Flag.withDescription("Number of translation samples to generate (default: 1)"),
);

export const configPathOption = Flag.String("config-path").pipe(
  Flag.optional,
  Flag.withDescription("Override tsl config path (default: ~/.config/tsl/config.yaml)"),
);

export const initOption = Flag.Boolean("init").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Initialize or overwrite the tsl config and exit"),
);

export const showConfigOption = Flag.Boolean("config").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Show the current tsl config and exit"),
);

export const loadShowOption = Flag.Boolean("load-show").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Show the resolved config that the CLI loads from the XDG path"),
);

export const promptInfoOption = Flag.Boolean("prompt").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Print the current system prompt and persona settings"),
);

export const doctorOption = Flag.Boolean("doctor").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Check config, provider connectivity, and clipboard availability"),
);

export const promptInput = Prompt.String({
  message: "Enter the Korean instruction to translate",
  validate: (value) => {
    const trimmed = value.trim();
    return trimmed.length === 0 ? Effect.fail("Prompt cannot be empty") : Effect.succeed(trimmed);
  },
});

export const ensureLength = (value: number): Effect.Effect<number, TranslationError> =>
  value <= 0 ? Effect.fail(new TranslationError({ message: "--length must be greater than 0" })) : Effect.succeed(value);
