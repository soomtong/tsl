import { Args, Command, HelpDoc, Options } from "@effect/cli";
import * as ValidationError from "@effect/cli/ValidationError";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { Effect } from "effect";

type PersonaKey = "default" | "programming" | "research" | "review";

const PERSONAS: Record<PersonaKey, { readonly title: string; readonly system: string }> = {
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

const promptArg = Args.text({ name: "prompt" });

const personaOption: Options.Options<PersonaKey> = Options.choice("persona", [
  "default",
  "programming",
  "research",
  "review"
])
  .pipe(Options.withDefault<PersonaKey>("default"))
  .pipe(Options.withDescription("Selects the translation persona preset"));

const personaCommand = Command.make(
  "persona",
  {
    persona: personaOption,
    prompt: promptArg
  },
  ({ persona, prompt }) => {
    return Effect.sync(() => {
      const preset = PERSONAS[persona];
      console.log(`[persona] ${persona} — ${preset.title}`);
      console.log(`[system] ${preset.system}`);
      console.log(`[prompt] ${prompt}`);
    });
  }
).pipe(
  Command.withDescription(
    HelpDoc.p("Translate a Korean prompt with persona-specific system instructions.")
  )
);

const runPersona = Command.run(personaCommand, {
  name: "tsl-persona",
  version: "0.1.0"
});

const rawArgv = Bun.argv;
const effectiveArgv = rawArgv.length <= 2 ? [...rawArgv, "--help"] : rawArgv;

const program = runPersona(effectiveArgv).pipe(
  Effect.provide(BunContext.layer)
);

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
        console.error(`⛔️ persona CLI failed: ${message}`);
      })
    )
  )
);

