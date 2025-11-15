import { Command, HelpDoc, Options, Prompt } from "@effect/cli";
import * as ValidationError from "@effect/cli/ValidationError";
import * as FileSystem from "@effect/platform/FileSystem";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { Effect } from "effect";
import * as Redacted from "effect/Redacted";

const CONFIG_DIR_NAME = "tsl";
const CONFIG_FILE_NAME = "config.yaml";

type Provider = "openai" | "google";
type PersonaKey = "default" | "programming" | "research" | "review";

type ProvidersEntry = {
  readonly name: Provider;
  readonly apiKey: string;
  readonly model: string;
};

type ConfigData = {
  readonly providers: ReadonlyArray<ProvidersEntry>;
  readonly translation: {
    readonly source: string;
    readonly target: string;
    readonly autoCopyToClipboard: boolean;
    readonly formatter: string;
  };
  readonly profiles: Record<
    PersonaKey,
    {
      readonly temperature: number;
      readonly maxTokens?: number;
      readonly styleHint?: string;
    }
  >;
  readonly preferredPersona: PersonaKey;
};

const providerPrompt = Prompt.select<Provider>({
  message: "Select provider",
  choices: [
    { title: "openai", value: "openai", description: "Use OpenAI endpoints" },
    {
      title: "google",
      value: "google",
      description: "Use Google Gemini endpoints",
    },
  ],
});

const apiKeyPrompt = Prompt.password({
  message: "Enter API key",
  validate: (value) => (value.trim().length === 0 ? Effect.fail("API key cannot be empty") : Effect.succeed(value.trim())),
});

const personaPrompt = Prompt.select<PersonaKey>({
  message: "Preferred persona",
  choices: [
    { title: "default", value: "default" },
    { title: "programming", value: "programming" },
    { title: "research", value: "research" },
    { title: "review", value: "review" },
  ],
});

const initOption = Options.boolean("init").pipe(Options.withDescription("Initialize or overwrite the YAML config file"));

const showOption = Options.boolean("show").pipe(Options.withDescription("Prints the current YAML config if it exists"));

const configCommand = Command.make(
  "config",
  {
    init: initOption,
    show: showOption,
  },
  ({ init, show }) =>
    Effect.gen(function* () {
      const configPath = resolveConfigPath();

      if (show) {
        yield* showConfig(configPath);
        return;
      }

      if (init) {
        yield* runInitFlow(configPath);
        return;
      }

      console.log("No action specified. Use --init or --show.");
    }),
).pipe(
  Command.withDescription(
    HelpDoc.p("Manage tsl YAML config using XDG Base Directory conventions. Use --init to create or --show to inspect."),
  ),
);

const runCli = Command.run(configCommand, {
  name: "tsl-config",
  version: "0.1.0",
});

const program = runCli(Bun.argv).pipe(Effect.provide(BunContext.layer));

BunRuntime.runMain(
  program.pipe(
    Effect.catchAll((error: unknown) =>
      Effect.sync(() => {
        if (ValidationError.isValidationError(error)) {
          console.error(HelpDoc.toAnsiText(error.error));
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        console.error(`⛔️ config CLI failed: ${message}`);
      }),
    ),
  ),
);

function resolveConfigPath(): string {
  const xdgHome = process.env.XDG_CONFIG_HOME;
  const homeDir = Bun.env.HOME ?? process.env.HOME ?? "";
  const baseDir = xdgHome && xdgHome.length > 0 ? xdgHome : homeDir ? `${homeDir}/.config` : ".";
  return `${baseDir}/${CONFIG_DIR_NAME}/${CONFIG_FILE_NAME}`;
}

const defaultConfig = (provider: Provider, apiKey: string): ConfigData => ({
  providers: [
    {
      name: provider,
      apiKey,
      model: provider === "openai" ? "gpt-4o-mini" : "gemini-2.5-flash",
    },
  ],
  translation: {
    source: "ko",
    target: "en",
    autoCopyToClipboard: true,
    formatter: "Please convert the Korean prompt into concise English that coding agents understand. Keep imperative mood.",
  },
  profiles: {
    default: {
      temperature: 0.4,
      maxTokens: 1024,
      styleHint: undefined,
    },
    programming: {
      temperature: 0.2,
      styleHint: "Emphasize reproducible steps and include code if needed.",
    },
    research: {
      temperature: 0.3,
      styleHint: "Focus on assumptions, references, and structured analysis.",
    },
    review: {
      temperature: 0.3,
      styleHint: "Highlight potential gaps, testing plans, and quality checks.",
    },
  },
  preferredPersona: "programming",
});

function buildConfig(provider: Provider, apiKey: string, preferredPersona: PersonaKey): ConfigData {
  const config = defaultConfig(provider, apiKey);
  return { ...config, preferredPersona };
}

const ensureDirectoryExists = (path: string) =>
  Effect.gen(function* () {
    const dir = path.split("/").slice(0, -1).join("/");
    if (dir.length === 0) {
      return;
    }
    const fs = yield* FileSystem.FileSystem;
    yield* fs.makeDirectory(dir, { recursive: true });
  });

const writeConfig = (path: string, config: ConfigData) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* ensureDirectoryExists(path);
    const yaml = Bun.YAML.stringify(config);
    yield* fs.writeFileString(path, yaml);
  });

const showConfig = (path: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(path);
    if (!exists) {
      console.log(`No config found at ${path}. Use --init to create one.`);
      return;
    }
    const content = yield* fs.readFileString(path);
    console.log(`--- ${path} ---`);
    console.log(content);
  });

const runInitFlow = (configPath: string) =>
  Effect.gen(function* () {
    const provider = yield* providerPrompt;
    const apiKey = yield* apiKeyPrompt;
    const preferredPersona = yield* personaPrompt;

    const config = buildConfig(provider, Redacted.value(apiKey), preferredPersona);
    yield* writeConfig(configPath, config);
    console.log(`✅ Configuration written to ${configPath}`);
  });
