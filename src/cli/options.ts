import { Args, Options, Prompt } from "@effect/cli";
import { Effect } from "effect";
import { personaKeys } from "../domain/persona";

export const promptArg = Args.optional(Args.text({ name: "prompt" }));

export const personaOption = Options.choice("persona", personaKeys).pipe(
  Options.optional,
  Options.withDescription("Selects the translation persona preset"),
);

export const langOption = Options.text("lang")
  .pipe(Options.optional)
  .pipe(Options.withDescription("Override target language (default: config target)"));

export const lengthOption = Options.integer("length")
  .pipe(Options.withDefault(1))
  .pipe(Options.withDescription("Number of translation samples to generate (default: 1)"));

export const configPathOption = Options.text("config-path")
  .pipe(Options.optional)
  .pipe(Options.withDescription("Override tsl config path (default: ~/.config/tsl/config.yaml)"));

export const initOption = Options.boolean("init").pipe(Options.withDescription("Initialize or overwrite the tsl config and exit"));

export const showConfigOption = Options.boolean("config").pipe(Options.withDescription("Show the current tsl config and exit"));

export const loadShowOption = Options.boolean("load-show").pipe(
  Options.withDescription("Show the resolved config that main loads from the XDG path"),
);

export const promptInfoOption = Options.boolean("prompt").pipe(
  Options.withDescription("Print the current system prompt and persona settings"),
);

export const promptInput = Prompt.text({
  message: "Enter the Korean instruction to translate",
  validate: (value) => {
    const trimmed = value.trim();
    return trimmed.length === 0 ? Effect.fail("Prompt cannot be empty") : Effect.succeed(trimmed);
  },
});

export const ensureLength = (value: number) =>
  value <= 0 ? Effect.fail(new Error("--length must be greater than 0")) : Effect.succeed(value);
