import { BunRuntime } from "@effect/platform-bun";
import { Effect, pipe } from "effect";

const SOURCE_PROMPT = "자바 25 버전에 맞는 최소화된 hello world 프로그램 파일 생성";
const MODEL = "gpt-4o-mini";
const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";

type ResponseContentPart = {
  readonly type?: string;
  readonly text?: string;
};

type ResponsesPayload = {
  readonly output?: ReadonlyArray<{
    readonly content?: ReadonlyArray<ResponseContentPart>;
  }>;
  readonly choices?: ReadonlyArray<{
    readonly message?: {
      readonly content?: ReadonlyArray<ResponseContentPart>;
    };
  }>;
  readonly error?: {
    readonly message?: string;
  };
};

const requireEnvVar = (name: string) =>
  pipe(
    Effect.fromNullable(process.env[name]),
    Effect.orElseFail(() => new Error(`Missing required env var: ${name}`)),
  );

const translatePrompt = Effect.gen(function* () {
  const apiKey = yield* requireEnvVar("OPENAI_API_KEY");

  const responseJson = yield* Effect.tryPromise({
    try: async (): Promise<ResponsesPayload> => {
      const response = await fetch(OPENAI_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: [
                    "Translate the following Korean requirement into native English.",
                    "Respond with only the translated sentence.",
                    "",
                    `Korean: ${SOURCE_PROMPT}`,
                  ].join("\n"),
                },
              ],
            },
          ],
        }),
      });

      const payload = (await response.json()) as ResponsesPayload;

      if (!response.ok) {
        const message = payload.error?.message ?? JSON.stringify(payload, null, 2);
        throw new Error(`OpenAI request failed (${response.status}): ${message}`);
      }

      return payload;
    },
    catch: (error) => (error instanceof Error ? error : new Error(String(error))),
  });

  const translated = extractFromOutput(responseJson) ?? extractFromChoices(responseJson);

  if (!translated) {
    throw new Error("OpenAI response did not include translated text");
  }

  return translated.trim();
});

const extractFromOutput = (payload: ResponsesPayload): string | undefined => {
  return payload.output?.flatMap((item) => item.content ?? []).find((part) => typeof part.text === "string")?.text;
};

const extractFromChoices = (payload: ResponsesPayload): string | undefined => {
  return payload.choices?.flatMap((choice) => choice.message?.content ?? []).find((part) => typeof part.text === "string")?.text;
};

const program = pipe(
  translatePrompt,
  Effect.tap((translation) =>
    Effect.sync(() => {
      console.log(`Translated instruction: ${translation}`);
    }),
  ),
);

BunRuntime.runMain(
  program.pipe(
    Effect.catchAll((error) =>
      Effect.sync(() => {
        const message = error instanceof Error ? error.message : "Unknown error occurred";
        console.error(`⛔️ translate failed: ${message}`);
      }),
    ),
  ),
);
