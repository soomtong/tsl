import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import type { AppConfig, ProviderConfig } from "../domain/config";
import { ConfigError } from "../domain/errors";

type DoctorCheck = {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
};

const DEFAULT_PROVIDER_URLS = {
  openai: "https://api.openai.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta/openai",
  openrouter: "https://openrouter.ai/api/v1",
} as const;

const AUTH_ENDPOINTS = {
  openai: "/models",
  google: "/models",
  // OpenRouter's /models endpoint is public, so only /key validates the API key.
  openrouter: "/key",
} as const;

const healthUrl = (provider: ProviderConfig) =>
  `${(provider.apiUrl ?? DEFAULT_PROVIDER_URLS[provider.name]).replace(/\/+$/, "")}${AUTH_ENDPOINTS[provider.name]}`;

const checkProvider = (provider: ProviderConfig): Effect.Effect<DoctorCheck, never, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const request = HttpClientRequest.get(healthUrl(provider)).pipe(HttpClientRequest.bearerToken(provider.apiKey));
    const status = yield* HttpClient.execute(request).pipe(
      Effect.timeout("5 seconds"),
      Effect.match({
        onSuccess: (response) => response.status,
        onFailure: () => 0,
      }),
    );

    const authFailed = status === 401 || status === 403;
    const detail =
      status === 0
        ? `unreachable (${provider.model})`
        : authFailed
          ? `HTTP ${status} — authentication failed, check apiKey (${provider.model})`
          : `HTTP ${status} (${provider.model})`;

    return {
      name: `provider:${provider.name}`,
      ok: status >= 200 && status < 300,
      detail,
    };
  });

const checkClipboard = (): DoctorCheck => {
  const binary = Bun.which("pbcopy");
  return {
    name: "clipboard",
    ok: binary !== null,
    detail: binary ?? "pbcopy not found",
  };
};

const renderChecks = (checks: ReadonlyArray<DoctorCheck>) =>
  Effect.forEach(checks, (check) => Console.log(`${check.ok ? "✅" : "⛔️"} ${check.name} — ${check.detail}`));

export const runDoctor = (config: AppConfig): Effect.Effect<void, ConfigError, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const providerChecks = yield* Effect.forEach(config.providers, checkProvider, { concurrency: "unbounded" });
    const checks: ReadonlyArray<DoctorCheck> = [
      {
        name: "config",
        ok: config.providers.length > 0,
        detail: `${config.providers.length} provider(s), persona ${config.preferredPersona}`,
      },
      ...providerChecks,
      checkClipboard(),
    ];

    yield* Console.log("Health checks");
    yield* renderChecks(checks);

    const failures = checks.filter((check) => !check.ok).length;
    if (failures > 0) {
      return yield* new ConfigError({ message: `Doctor found ${failures} issue(s)` });
    }
  });
