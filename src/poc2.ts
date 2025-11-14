import { IdGenerator, LanguageModel, Prompt } from "@effect/ai";
import * as OpenAiClient from "@effect/ai-openai/OpenAiClient";
import * as OpenAiLanguageModel from "@effect/ai-openai/OpenAiLanguageModel";
import { BunRuntime } from "@effect/platform-bun";
import * as FetchHttpClient from "@effect/platform/FetchHttpClient";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
import * as Layer from "effect/Layer";

const MODEL = "gpt-4o-mini";
const SOURCE_PROMPT =
  "자바 25 버전에 맞는 최소화된 hello world 프로그램 파일 생성";

const translationPrompt = Prompt.make([
  {
    role: "system",
    content:
      "You are a professional bilingual software assistant. Translate Korean engineering prompts into concise native English. Only respond with the translated instruction."
  },
  {
    role: "user",
    content: SOURCE_PROMPT
  }
]);

const translateInstruction = Effect.gen(function* (_) {
  const response = yield* _(
    LanguageModel.generateText({
      prompt: translationPrompt,
      toolChoice: "none"
    })
  );

  const trimmed = response.text.trim();

  if (trimmed.length === 0) {
    return yield* _(Effect.fail(new Error("Language model returned empty text")));
  }

  return trimmed;
});

const formatError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const program = pipe(
  translateInstruction,
  Effect.tap((text) =>
    Effect.sync(() => {
      console.log(`Effect AI translation: ${text}`);
    })
  )
);

const httpLayer = FetchHttpClient.layer;

const openAiClientLayer = Layer.provide(
  OpenAiClient.layerConfig({
    apiKey: Config.redacted("OPENAI_API_KEY")
  }),
  httpLayer
);

const openAiModelLayer = Layer.provide(
  OpenAiLanguageModel.layer({
    model: MODEL
  }),
  openAiClientLayer
);

const idLayer = Layer.succeed(
  IdGenerator.IdGenerator,
  IdGenerator.defaultIdGenerator
);

const effectAiLayer = Layer.merge(idLayer, openAiModelLayer);

BunRuntime.runMain(
  program.pipe(
    Effect.provide(effectAiLayer),
    Effect.catchAll((error) =>
      Effect.sync(() => {
        console.error(`⛔️ effect-ai failed: ${formatError(error)}`);
      })
    )
  )
);

