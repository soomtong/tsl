import * as FileSystem from "@effect/platform/FileSystem";
import { Effect, Option, pipe } from "effect";
import { AppConfig, ProviderConfig, ProviderName, buildDefaultConfig, defaultProfiles } from "../../domain/config";
import { PersonaKey, fallbackPersonaKey } from "../../domain/persona";

const ENV_PATTERN = /^\$\{ENV:([A-Z0-9_]+)\}$/i;

const requireEnvVar = (name: string) =>
  pipe(
    Effect.fromNullable(Bun.env[name] ?? process.env[name]),
    Effect.orElseFail(() => new Error(`Missing required env var: ${name}`)),
  );

const substituteEnv = (value: string) => {
  const match = value.match(ENV_PATTERN);
  if (!match) {
    return Effect.succeed(value);
  }
  return requireEnvVar(match[1]);
};

const resolveProviderSecrets = (providers: ReadonlyArray<ProviderConfig>) =>
  Effect.forEach(
    providers,
    (provider) =>
      pipe(
        substituteEnv(provider.apiKey),
        Effect.map((apiKey) => ({
          ...provider,
          apiKey,
        })),
      ),
    { concurrency: "unbounded" },
  );

const mergeProfiles = (
  base: Record<PersonaKey, (typeof defaultProfiles)[PersonaKey]>,
  overrides: Partial<Record<PersonaKey, (typeof defaultProfiles)[PersonaKey]>> | undefined,
) => {
  if (!overrides) {
    return base;
  }
  const entries = Object.entries(base).map(([key, value]) => {
    const maybeOverride = overrides[key as PersonaKey];
    return [key, maybeOverride ? { ...value, ...maybeOverride } : value];
  });
  return Object.fromEntries(entries) as typeof base;
};

const mergeConfig = (partial: Partial<AppConfig> | undefined, fallback: AppConfig): AppConfig => {
  if (!partial) {
    return fallback;
  }

  const providers = partial.providers && partial.providers.length > 0 ? partial.providers : fallback.providers;
  const translation = partial.translation ? { ...fallback.translation, ...partial.translation } : fallback.translation;
  const preferredPersona = partial.preferredPersona ?? fallback.preferredPersona ?? fallbackPersonaKey;

  return {
    providers,
    translation,
    profiles: mergeProfiles(fallback.profiles, partial.profiles),
    preferredPersona,
  };
};

const parseConfig = (raw: string): Partial<AppConfig> | undefined => {
  const parsed = Bun.YAML.parse(raw) as Partial<AppConfig> | undefined;
  return parsed ?? undefined;
};

const readConfigFile = (path: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(path);
    if (!exists) {
      return Option.none<string>();
    }
    const content = yield* fs.readFileString(path);
    return Option.some(content);
  });

const determineBaseDir = () => {
  const xdgHome = Bun.env.XDG_CONFIG_HOME ?? process.env.XDG_CONFIG_HOME;
  if (xdgHome && xdgHome.length > 0) {
    return xdgHome;
  }
  const homeDir = Bun.env.HOME ?? process.env.HOME;
  if (homeDir && homeDir.length > 0) {
    return `${homeDir}/.config`;
  }
  return ".";
};

export const resolveDefaultConfigPath = () => `${determineBaseDir()}/tsl/config.yaml`;

export const loadConfig = (pathOverride?: string) =>
  Effect.gen(function* () {
    const openAiKey = yield* requireEnvVar("OPENAI_API_KEY");
    const fallback = buildDefaultConfig(openAiKey);
    const targetPath = pathOverride ?? resolveDefaultConfigPath();

    const content = yield* readConfigFile(targetPath);

    const merged = mergeConfig(
      pipe(
        content,
        Option.map(parseConfig),
        Option.getOrUndefined,
      ),
      fallback,
    );

    const resolvedProviders = yield* resolveProviderSecrets(merged.providers);

    if (resolvedProviders.length === 0) {
      throw new Error("No providers available after resolving config");
    }

    return {
      ...merged,
      providers: resolvedProviders,
    };
  });

export const selectProviderOrFail = (config: AppConfig, preferred?: ProviderName): ProviderConfig => {
  if (preferred) {
    const provider = config.providers.find((entry) => entry.name === preferred);
    if (!provider) {
      throw new Error(`Provider ${preferred} not found in config`);
    }
    return provider;
  }
  const [first] = config.providers;
  if (!first) {
    throw new Error("No providers defined");
  }
  return first;
};

