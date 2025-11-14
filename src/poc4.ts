import { Args, Command, HelpDoc, Options, Prompt } from "@effect/cli";
import * as ValidationError from "@effect/cli/ValidationError";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { Effect } from "effect";
import * as Option from "effect/Option";

type PersonaKey = "default" | "programming" | "research" | "review";

const PERSONAS: Record<
  PersonaKey,
  { readonly title: string; readonly system: string }
> = {
  default: {
    title: "General bilingual assistant",
    system:
      "Provide balanced translations and rewrite Korean requirements into concise English instructions."
  },
  programming: {
    title: "Strict coding assistant",
    system:
      "Translate with focus on code generation clarity, highlight required tooling and versions, avoid fluff."
  },
  research: {
    title: "Analytical researcher",
    system:
      "Translate and expand on intent to clarify research goals, cite assumptions, and keep tone formal."
  },
  review: {
    title: "Peer reviewer",
    system:
      "Translate to English and point out potential gaps or validation steps, keeping feedback actionable."
  }
};

const personaChoices = Object.entries(PERSONAS).map(([key, value]) => ({
  title: `${key} — ${value.title}`,
  value: key as PersonaKey,
  description: value.system
}));

const personaSelectionPrompt = Prompt.select<PersonaKey>({
  message: "Select a translation persona",
  choices: personaChoices
});

const userPromptInput = Prompt.text({
  message: "Enter the Korean instruction to translate",
  validate: (text) => {
    const trimmed = text.trim();
    return trimmed.length === 0
      ? Effect.fail("Prompt cannot be empty")
      : Effect.succeed(text);
  }
});

const personaLiterals = [
  "default",
  "programming",
  "research",
  "review"
] as const;

const cliPersonaOption = Options.choice("persona", personaLiterals).pipe(
  Options.optional,
  Options.withDescription("Override persona without interactive prompt")
);

const cliPromptArg = Args.optional(Args.text({ name: "prompt" }));

const personaCommand = Command.make(
  "persona-prompt",
  {
    persona: cliPersonaOption,
    prompt: cliPromptArg
  },
  ({ persona, prompt }) =>
    Effect.gen(function* () {
      const finalPersona = yield* Option.match(persona, {
        onSome: (value) => Effect.succeed(value),
        onNone: () => personaSelectionPrompt
      });

      const finalPrompt = yield* Option.match(prompt, {
        onSome: (value) => Effect.succeed(value),
        onNone: () => userPromptInput
      });

      const preset = PERSONAS[finalPersona];

      yield* Effect.sync(() => {
        console.log(`[persona] ${finalPersona} — ${preset.title}`);
        console.log(`[system] ${preset.system}`);
        console.log(`[prompt] ${finalPrompt}`);
      });
    })
).pipe(
  Command.withDescription(
    HelpDoc.p(
      "Interactively select a persona and provide a prompt, or pass args to skip prompts."
    )
  )
);

const runPromptCli = Command.run(personaCommand, {
  name: "tsl-prompt",
  version: "0.1.0"
});

const program = runPromptCli(Bun.argv).pipe(Effect.provide(BunContext.layer));

BunRuntime.runMain(
  program.pipe(
    Effect.catchAll((error: unknown) =>
      Effect.sync(() => {
        if (ValidationError.isValidationError(error)) {
          console.error(HelpDoc.toAnsiText(error.error));
          return;
        }
        const message =
          error instanceof Error ? error.message : String(error);
        console.error(`⛔️ prompt CLI failed: ${message}`);
      })
    )
  )
);

