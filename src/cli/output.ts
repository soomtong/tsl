import * as Console from 'effect/Console';
import * as Effect from 'effect/Effect';
import type { AppConfig, ProfileConfig } from '../domain/config';
import type { PersonaPreset } from '../domain/persona';

export interface PromptDetails {
  readonly persona: PersonaPreset;
  readonly profile: ProfileConfig;
  readonly config: AppConfig;
  readonly targetLanguage: string;
  readonly systemMessage: string;
}

function logPersona(persona: PersonaPreset) {
  return Console.log(`🧑‍💼 [persona] ${persona.key} — ${persona.title}`);
}

export function logPersonaAndTarget(
  persona: PersonaPreset,
  targetLanguage: string,
) {
  return Effect.gen(function* () {
    yield* logPersona(persona);
    yield* Console.log(`🎯 [target] ${targetLanguage}`);
  });
}

/** Prints each sample, numbering them only when there is more than one. */
export function logTranslationOutputs(outputs: readonly string[]) {
  return Effect.forEach(outputs, (text, index) =>
    Effect.gen(function* () {
      const label =
        outputs.length === 1 ? '[translation]' : `[translation ${index + 1}]`;
      yield* Console.log(`📝 ${label}`);
      yield* Console.log(text);
      yield* Console.log('');
    }),
  );
}

export function logClipboardStatus(copied: boolean, autoCopyEnabled: boolean) {
  return Effect.gen(function* () {
    if (copied) {
      yield* Console.log('✅ Copied translation to clipboard');
    } else if (!autoCopyEnabled) {
      yield* Console.log('ℹ️ Auto-copy disabled in config');
    }
  });
}

/** Dumps the effective persona, profile and system prompt (`--prompt`). */
export function printPromptDetails({
  persona,
  profile,
  config,
  targetLanguage,
  systemMessage,
}: PromptDetails) {
  return Effect.gen(function* () {
    yield* logPersona(persona);
    yield* Console.log(`🎯 [target language] ${targetLanguage}`);
    yield* Console.log(`🌡️[temperature] ${profile.temperature}`);
    yield* Console.log(
      `📏 [maxTokens] ${profile.maxTokens ?? 'provider default'}`,
    );
    yield* Console.log(`🎨 [styleHint] ${profile.styleHint ?? 'none'}`);
    yield* Console.log(
      `⚙️[translation settings] source=${config.translation.source} autoCopy=${config.translation.autoCopyToClipboard ? 'on' : 'off'}`,
    );
    yield* Console.log('🪄 [formatter]');
    yield* Console.log(config.translation.formatter);
    yield* Console.log('--- system prompt ---');
    yield* Console.log(systemMessage);
  });
}
