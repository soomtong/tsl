import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';
import type {
  AppConfig,
  ProfileConfig,
  ProviderConfig,
  TranslationSection,
} from '../../domain/config';
import {
  defaultProfiles,
  defaultTranslationSection,
} from '../../domain/config';
import { ConfigError } from '../../domain/errors';
import { DEFAULT_MODELS } from '../../domain/models';
import type { PersonaKey } from '../../domain/persona';
import { fallbackPersonaKey, personaKeys } from '../../domain/persona';

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
  preferredPersona: Schema.optional(Schema.Literals(personaKeys)),
});

type ConfigDocument = {
  readonly providers?: ReadonlyArray<ProviderConfig>;
  readonly translation?: Partial<TranslationSection>;
  readonly profiles?: Partial<Record<PersonaKey, Partial<ProfileConfig>>>;
  readonly preferredPersona?: PersonaKey;
};

export const parseConfigDocument = (
  raw: string,
): Effect.Effect<ConfigDocument, ConfigError> =>
  Effect.try({
    try: () => Bun.YAML.parse(raw) as unknown,
    catch: (error) =>
      new ConfigError({
        message: `Invalid YAML: ${error instanceof Error ? error.message : String(error)}`,
      }),
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

const requireEnvVar = (name: string): Effect.Effect<string, ConfigError> =>
  Effect.gen(function* () {
    const value = Bun.env[name];
    if (value === undefined || value.length === 0) {
      return yield* new ConfigError({
        message: `Missing required env var: ${name}`,
      });
    }
    return value;
  });

const substituteEnv = (value: string): Effect.Effect<string, ConfigError> => {
  const match = value.match(ENV_PATTERN);
  const envVar = match?.[1];
  if (!envVar) {
    return Effect.succeed(value);
  }
  return requireEnvVar(envVar);
};

const resolveProviderSecrets = (providers: ReadonlyArray<ProviderConfig>) =>
  Effect.forEach(
    providers,
    (provider) =>
      substituteEnv(provider.apiKey).pipe(
        Effect.map((apiKey) => ({
          ...provider,
          apiKey,
        })),
      ),
    { concurrency: 'unbounded' },
  );

export const mergeProfiles = (
  overrides?: Partial<Record<PersonaKey, Partial<ProfileConfig>>>,
): Record<PersonaKey, ProfileConfig> =>
  Object.fromEntries(
    personaKeys.map((key) => [
      key,
      { ...defaultProfiles[key], ...(overrides?.[key] ?? {}) },
    ]),
  ) as Record<PersonaKey, ProfileConfig>;

const readConfigFile = (
  path: string,
): Effect.Effect<Option.Option<string>, ConfigError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
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

const determineBaseDir = () => {
  const xdgHome = Bun.env.XDG_CONFIG_HOME;
  if (xdgHome && xdgHome.length > 0) {
    return xdgHome;
  }
  const homeDir = Bun.env.HOME;
  if (homeDir && homeDir.length > 0) {
    return `${homeDir}/.config`;
  }
  return '.';
};

export const resolveDefaultConfigPath = () =>
  `${determineBaseDir()}/tsl/config.yaml`;

const ensureProviders = (
  providers: ReadonlyArray<ProviderConfig> | undefined,
): Effect.Effect<ReadonlyArray<ProviderConfig>, ConfigError> =>
  Effect.gen(function* () {
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
    ] satisfies ReadonlyArray<ProviderConfig>;
  });

export const loadConfig = (
  pathOverride?: string,
): Effect.Effect<AppConfig, ConfigError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
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
        ...defaultTranslationSection,
        ...(document.translation ?? {}),
      },
      profiles: mergeProfiles(document.profiles),
      preferredPersona: document.preferredPersona ?? fallbackPersonaKey,
    } satisfies AppConfig;
  });
