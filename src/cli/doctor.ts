import * as Console from 'effect/Console';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import { HttpClient, HttpClientRequest } from 'effect/http';
import * as Path from 'effect/Path';
import type { AppConfig, ProviderConfig } from '../domain/config';
import { ConfigError } from '../domain/errors';
import { DEFAULT_PROVIDER_URLS } from '../domain/models';

interface DoctorCheck {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

const AUTH_ENDPOINTS = {
  openai: '/models',
  google: '/models',
  // OpenRouter's /models endpoint is public, so only /key validates the API key.
  openrouter: '/key',
} as const;

const IGNORED_CONFIG_NAMES = ['config.json', 'config.yml'] as const;

function healthUrl(provider: ProviderConfig): string {
  const base = provider.apiUrl ?? DEFAULT_PROVIDER_URLS[provider.name];
  return `${base.replace(/\/+$/, '')}${AUTH_ENDPOINTS[provider.name]}`;
}

function checkProvider(
  provider: ProviderConfig,
): Effect.Effect<DoctorCheck, never, HttpClient.HttpClient> {
  return Effect.gen(function* () {
    const request = HttpClientRequest.get(healthUrl(provider)).pipe(
      HttpClientRequest.bearerToken(provider.apiKey),
    );
    const status = yield* HttpClient.execute(request).pipe(
      Effect.timeout('5 seconds'),
      Effect.match({
        onSuccess: (response) => response.status,
        onFailure: () => 0,
      }),
    );

    const authFailed = status === 401 || status === 403;
    let detail: string;
    if (status === 0) {
      detail = `unreachable (${provider.model})`;
    } else if (authFailed) {
      detail = `HTTP ${status} — authentication failed, check apiKey (${provider.model})`;
    } else {
      detail = `HTTP ${status} (${provider.model})`;
    }

    return {
      name: `provider:${provider.name}`,
      ok: status >= 200 && status < 300,
      detail,
    };
  });
}

// Resolves against the live PATH (not the one captured at startup) so the
// check agrees with how the clipboard layer spawns the binary.
function checkClipboard(): DoctorCheck {
  const binary = Bun.which('pbcopy', { PATH: Bun.env.PATH });
  return {
    name: 'clipboard',
    ok: binary !== null,
    detail: binary ?? 'pbcopy not found',
  };
}

function renderChecks(checks: readonly DoctorCheck[]) {
  return Effect.forEach(checks, (check) =>
    Console.log(`${check.ok ? '✅' : '⛔️'} ${check.name} — ${check.detail}`),
  );
}

/**
 * Prints health checks for the config, each provider's auth endpoint and the
 * clipboard binary, then fails with `ConfigError` if any check is red.
 */
export function runDoctor(
  config: AppConfig,
  configPath: string,
): Effect.Effect<
  void,
  ConfigError,
  HttpClient.HttpClient | FileSystem.FileSystem | Path.Path
> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const providerChecks = yield* Effect.forEach(
      config.providers,
      checkProvider,
      { concurrency: 'unbounded' },
    );
    const checks: readonly DoctorCheck[] = [
      {
        name: 'config',
        ok: config.providers.length > 0,
        detail: `${config.providers.length} provider(s), persona ${config.preferredPersona} — ${configPath}`,
      },
      ...providerChecks,
      checkClipboard(),
    ];

    yield* Console.log('Health checks');
    yield* renderChecks(checks);

    for (const name of IGNORED_CONFIG_NAMES) {
      const candidate = path.join(path.dirname(configPath), name);
      const exists = yield* fs.exists(candidate).pipe(
        Effect.mapError(
          (error) =>
            new ConfigError({
              message: `Failed to inspect ${candidate}: ${error.message}`,
            }),
        ),
      );
      if (exists) {
        yield* Console.log(
          `ℹ️ ignored config: ${candidate} (only config.yaml is loaded)`,
        );
      }
    }

    const failures = checks.filter((check) => !check.ok).length;
    if (failures > 0) {
      return yield* new ConfigError({
        message: `Doctor found ${failures} issue(s)`,
      });
    }
  });
}
