import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';
import type {
  AppConfig,
  ProfileConfig,
  ProviderConfig,
} from '../../domain/config';
import {
  DEFAULT_PROFILES,
  DEFAULT_TRANSLATION_SECTION,
} from '../../domain/config';
import { ConfigError } from '../../domain/errors';
import { DEFAULT_MODELS } from '../../domain/models';
import type { PersonaKey } from '../../domain/persona';
import { FALLBACK_PERSONA_KEY } from '../../domain/persona';

/** `${ENV:NAME}` placeholders are replaced with the named env var. */
const ENV_PATTERN = /^\$\{ENV:([A-Z0-9_]+)\}$/i;

const ProviderConfigSchema = Schema.Struct({
  name: Schema.Literals(['openai', 'google', 'openrouter']),
  apiKey: Schema.String,
  model: Schema.String,
  apiUrl: Schema.optional(Schema.String),
});

const ProfileOverrideSchema = Schema.Struct({
  temperature: Schema.optional(Schema.Number),
  maxTokens: Schema.optional(Schema.Number),
  styleHint: Schema.optional(Schema.String),
});

const ProfilesOverrideSchema = Schema.Struct({
  default: Schema.optional(ProfileOverrideSchema),
  programming: Schema.optional(ProfileOverrideSchema),
  research: Schema.optional(ProfileOverrideSchema),
  review: Schema.optional(ProfileOverrideSchema),
});

const TranslationOverrideSchema = Schema.Struct({
  source: Schema.optional(Schema.String),
  target: Schema.optional(Schema.String),
  autoCopyToClipboard: Schema.optional(Schema.Boolean),
  formatter: Schema.optional(Schema.String),
});

const ConfigDocumentSchema = Schema.Struct({
  providers: Schema.optional(Schema.Array(ProviderConfigSchema)),
  translation: Schema.optional(TranslationOverrideSchema),
  profiles: Schema.optional(ProfilesOverrideSchema),
  preferredPersona: Schema.optional(
    Schema.Literals(['default', 'programming', 'research', 'review']),
  ),
});

/** The raw, partially-specified shape of config.yaml. */
export type ConfigDocument = typeof ConfigDocumentSchema.Type;

/** Per-persona overrides as they appear in `profiles:`. */
export type ProfileOverrides = NonNullable<ConfigDocument['profiles']>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Parses YAML text and validates it against the config schema. */
export function parseConfigDocument(
  raw: string,
): Effect.Effect<ConfigDocument, ConfigError> {
  return Effect.try({
    try: () => Bun.YAML.parse(raw) as unknown,
    catch: (error) =>
      new ConfigError({ message: `Invalid YAML: ${errorMessage(error)}` }),
  }).pipe(
    Effect.flatMap((parsed) =>
      Schema.decodeUnknownEffect(ConfigDocumentSchema)(parsed).pipe(
        Effect.mapError(
          (error) =>
            new ConfigError({ message: `Invalid config: ${error.message}` }),
        ),
      ),
    ),
  );
}

function requireEnvVar(name: string): Effect.Effect<string, ConfigError> {
  return Effect.gen(function* () {
    const value = Bun.env[name];
    if (value === undefined || value.length === 0) {
      return yield* new ConfigError({
        message: `Missing required env var: ${name}`,
      });
    }
    return value;
  });
}

function substituteEnv(value: string): Effect.Effect<string, ConfigError> {
  const envVar = value.match(ENV_PATTERN)?.[1];
  return envVar === undefined ? Effect.succeed(value) : requireEnvVar(envVar);
}

function resolveProviderSecrets(providers: readonly ProviderConfig[]) {
  return Effect.forEach(
    providers,
    (provider) =>
      substituteEnv(provider.apiKey).pipe(
        Effect.map((apiKey) => ({ ...provider, apiKey })),
      ),
    { concurrency: 'unbounded' },
  );
}

function mergeProfile(
  key: PersonaKey,
  overrides: ProfileOverrides | undefined,
): ProfileConfig {
  return { ...DEFAULT_PROFILES[key], ...overrides?.[key] };
}

/** Layers config overrides on top of the built-in profile defaults. */
export function mergeProfiles(
  overrides?: ProfileOverrides,
): Record<PersonaKey, ProfileConfig> {
  // Spelled out per key so adding a persona is a compile error here, not a
  // silently missing profile at runtime.
  return {
    default: mergeProfile('default', overrides),
    programming: mergeProfile('programming', overrides),
    research: mergeProfile('research', overrides),
    review: mergeProfile('review', overrides),
  };
}

function readConfigFile(
  path: string,
): Effect.Effect<Option.Option<string>, ConfigError, FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    if (!(yield* fs.exists(path))) {
      return Option.none<string>();
    }
    return Option.some(yield* fs.readFileString(path));
  }).pipe(
    Effect.mapError(
      (error) =>
        new ConfigError({
          message: `Failed to read ${path}: ${error.message}`,
        }),
    ),
  );
}

function determineBaseDir(): string {
  const xdgHome = Bun.env.XDG_CONFIG_HOME;
  if (xdgHome && xdgHome.length > 0) {
    return xdgHome;
  }
  const homeDir = Bun.env.HOME;
  if (homeDir && homeDir.length > 0) {
    return `${homeDir}/.config`;
  }
  return '.';
}

/** `$XDG_CONFIG_HOME/tsl/config.yaml`, falling back to `~/.config`. */
export function resolveDefaultConfigPath(): string {
  return `${determineBaseDir()}/tsl/config.yaml`;
}

function ensureProviders(
  providers: readonly ProviderConfig[] | undefined,
): Effect.Effect<readonly ProviderConfig[], ConfigError> {
  return Effect.gen(function* () {
    if (providers && providers.length > 0) {
      return providers;
    }
    const openAiKey = yield* requireEnvVar('OPENAI_API_KEY');
    return [
      {
        name: 'openai',
        apiKey: openAiKey,
        model: DEFAULT_MODELS.openai,
      },
    ] satisfies readonly ProviderConfig[];
  });
}

/**
 * Loads config.yaml (or the given path), fills in defaults and resolves
 * `${ENV:...}` secrets. A missing file falls back to `OPENAI_API_KEY`.
 */
export function loadConfig(
  pathOverride?: string,
): Effect.Effect<AppConfig, ConfigError, FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const targetPath = pathOverride ?? resolveDefaultConfigPath();
    const content = yield* readConfigFile(targetPath);

    const document = yield* Option.match(content, {
      onNone: () => Effect.succeed<ConfigDocument>({}),
      onSome: parseConfigDocument,
    });

    const providers = yield* ensureProviders(document.providers);
    const resolvedProviders = yield* resolveProviderSecrets(providers);

    return {
      providers: resolvedProviders,
      translation: {
        ...DEFAULT_TRANSLATION_SECTION,
        ...document.translation,
      },
      profiles: mergeProfiles(document.profiles),
      preferredPersona: document.preferredPersona ?? FALLBACK_PERSONA_KEY,
    } satisfies AppConfig;
  });
}
