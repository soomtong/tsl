import { describe, expect, test } from 'bun:test';
import { LanguageModel } from 'effect/ai';
import type * as Response from 'effect/ai/Response';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Layer from 'effect/Layer';
import * as Stream from 'effect/Stream';
import type { AppConfig } from '../domain/config';
import { AppConfigService } from '../domain/config';
import { PERSONA_PRESETS } from '../domain/persona';
import type { TranslationRequest } from '../domain/translationRequest';
import { Clipboard } from './ports/clipboard';
import { executeTranslation } from './translation';

const config: AppConfig = {
  providers: [{ name: 'openai', apiKey: 'test', model: 'gpt-4o-mini' }],
  translation: {
    source: 'ko',
    target: 'en',
    autoCopyToClipboard: true,
    formatter: 'Translate to English.',
  },
  profiles: {
    default: { temperature: 0.4 },
    programming: { temperature: 0.2 },
    research: { temperature: 0.3 },
    review: { temperature: 0.3 },
  },
  preferredPersona: 'programming',
};

const request: TranslationRequest = {
  sourceText: '인증 시스템을 구현해주세요',
  persona: PERSONA_PRESETS.programming,
  targetLanguage: 'English',
};

const fakeLanguageModel = (texts: ReadonlyArray<string>) => {
  let index = 0;
  return Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () =>
        Effect.sync(() => {
          const text = texts[index++] ?? '';
          return [
            { type: 'text' as const, text },
          ] satisfies ReadonlyArray<Response.PartEncoded>;
        }),
      streamText: () => Stream.empty,
    }),
  );
};

const clipboardLayer = (copied: Array<string>) =>
  Layer.succeed(Clipboard, {
    copy: (text: string) =>
      Effect.sync(() => {
        copied.push(text);
      }),
    paste: Effect.succeed(''),
  });

const provide = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    LanguageModel.LanguageModel | AppConfigService | Clipboard
  >,
  texts: ReadonlyArray<string>,
  copied: Array<string>,
) =>
  effect.pipe(
    Effect.provide(
      Layer.mergeAll(
        Layer.succeed(AppConfigService, config),
        fakeLanguageModel(texts),
        clipboardLayer(copied),
      ),
    ),
  );

describe('executeTranslation', () => {
  test('returns trimmed model output and copies the aggregate', async () => {
    const copied: Array<string> = [];
    const result = await Effect.runPromise(
      provide(
        executeTranslation({ request, sampleCount: 1 }),
        ['  Design an authentication system.  '],
        copied,
      ),
    );

    expect(result.outputs).toEqual(['Design an authentication system.']);
    expect(result.copiedToClipboard).toBe(true);
    expect(copied).toEqual(['Design an authentication system.']);
  });

  test('keeps input order across concurrent samples', async () => {
    const copied: Array<string> = [];
    const result = await Effect.runPromise(
      provide(
        executeTranslation({ request, sampleCount: 3 }),
        ['first', 'second', 'third'],
        copied,
      ),
    );

    expect(result.outputs).toEqual(['first', 'second', 'third']);
    expect(copied).toEqual(['first\n\nsecond\n\nthird']);
  });

  test('fails when the model returns empty text', async () => {
    const copied: Array<string> = [];
    const exit = await Effect.runPromiseExit(
      provide(executeTranslation({ request, sampleCount: 1 }), ['   '], copied),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(copied).toEqual([]);
  });

  test('skips the clipboard when auto-copy is disabled', async () => {
    const copied: Array<string> = [];
    const noCopyConfig: AppConfig = {
      ...config,
      translation: { ...config.translation, autoCopyToClipboard: false },
    };
    const result = await Effect.runPromise(
      executeTranslation({ request, sampleCount: 1 }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(AppConfigService, noCopyConfig),
            fakeLanguageModel(['translated']),
            clipboardLayer(copied),
          ),
        ),
      ),
    );

    expect(result.copiedToClipboard).toBe(false);
    expect(copied).toEqual([]);
  });
});
