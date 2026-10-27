import * as Console from 'effect/Console';
import * as Effect from 'effect/Effect';
import type { AppConfig, ProfileConfig } from '../domain/config';
import type { PersonaPreset } from '../domain/persona';

export const logPersonaAndTarget = (
  persona: PersonaPreset,
  targetLanguage: string,
) =>
  Effect.gen(function* () {
    yield* Console.log(`🧑‍💼 [persona] ${persona.key} — ${persona.title}`);
    yield* Console.log(`🎯 [target] ${targetLanguage}`);
  });

export const logTranslationOutputs = (outputs: ReadonlyArray<string>) =>
  Effect.forEach(outputs, (text, index) =>
    Effect.gen(function* () {
      const label =
        outputs.length === 1 ? '[translation]' : `[translation ${index + 1}]`;
      yield* Console.log(`📝 ${label}`);
      yield* Console.log(text);
      yield* Console.log('');
    }),
  );

export const logClipboardStatus = (copied: boolean, autoCopyEnabled: boolean) =>
  Effect.gen(function* () {
    if (copied) {
      yield* Console.log('✅ Copied translation to clipboard');
    } else if (!autoCopyEnabled) {
      yield* Console.log('ℹ️ Auto-copy disabled in config');
    }
  });

export const printPromptDetails = ({
  persona,
  profile,
  config,
  targetLanguage,
  systemMessage,
}: {
  readonly persona: PersonaPreset;
  readonly profile: ProfileConfig;
  readonly config: AppConfig;
  readonly targetLanguage: string;
  readonly systemMessage: string;
}) =>
  Effect.gen(function* () {
    yield* Console.log(`🧑‍💼 [persona] ${persona.key} — ${persona.title}`);
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
