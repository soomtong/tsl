import { afterEach, describe, expect, test } from "bun:test";
import { BunServices } from "@effect/platform-bun";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import { TestConsole } from "effect/testing";
import { runCli } from "./cli-program";

const tmpFiles: Array<string> = [];
const servers: Array<{ stop: (force?: boolean) => void }> = [];

const testLayer = Layer.mergeAll(BunServices.layer, FetchHttpClient.layer, TestConsole.layer);

const writeConfig = async (contents: string) => {
  const path = `${Bun.env.TMPDIR ?? "/tmp"}/tsl-cli-${crypto.randomUUID()}.yaml`;
  await Bun.write(path, contents);
  tmpFiles.push(path);
  return path;
};

const baseConfig = (providerLine: string, extra = "") => `providers:
${providerLine}
translation:
  source: ko
  target: English
  autoCopyToClipboard: false
  formatter: Translate to English.
profiles:
  programming:
    temperature: 0.2
    maxTokens: 128
    styleHint: Test hint
preferredPersona: programming
${extra}`;

const run = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(runCli(args));
    const logs = yield* TestConsole.logLines;
    const errors = yield* TestConsole.errorLines;
    return {
      exit,
      output: logs.map(String).join("\n"),
      errors: errors.map(String).join("\n"),
    };
  }).pipe(Effect.provide(testLayer));

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.stop(true);
  }
  for (const path of tmpFiles.splice(0)) {
    if (await Bun.file(path).exists()) {
      await Bun.file(path).delete();
    }
  }
});

describe("runCli", () => {
  test("prints the raw config file", async () => {
    const path = await writeConfig(baseConfig("  - name: openai\n    apiKey: sk-test\n    model: gpt-4o-mini"));
    const { exit, output } = await Effect.runPromise(run(["--config", "--config-path", path]));

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(output).toContain(`--- ${path} ---`);
    expect(output).toContain("name: openai");
  });

  test("prints resolved prompt settings", async () => {
    const path = await writeConfig(baseConfig("  - name: openai\n    apiKey: sk-test\n    model: gpt-4o-mini"));
    const { exit, output } = await Effect.runPromise(run(["--prompt", "--config-path", path]));

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(output).toContain("persona] programming");
    expect(output).toContain("maxTokens] 128");
    expect(output).toContain("Style hint: Test hint");
  });

  test("rejects a zero sample count", async () => {
    const path = await writeConfig(baseConfig("  - name: openai\n    apiKey: sk-test\n    model: gpt-4o-mini"));
    const { exit } = await Effect.runPromise(run(["--length", "0", "hello", "--config-path", path]));

    expect(Exit.isFailure(exit)).toBe(true);
  });

  test("doctor reports provider and clipboard status", async () => {
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        return new URL(request.url).pathname === "/v1/models"
          ? Response.json({ object: "list", data: [] })
          : new Response("not found", { status: 404 });
      },
    });
    servers.push(server);
    const path = await writeConfig(
      baseConfig(`  - name: google\n    apiKey: sk-secret\n    model: gemini-2.5-flash\n    apiUrl: http://127.0.0.1:${server.port}/v1`),
    );

    const { exit, output } = await Effect.runPromise(run(["--doctor", "--config-path", path]));

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(output).toContain("config — 1 provider(s), persona programming");
    expect(output).toContain("provider:google — HTTP 200 (gemini-2.5-flash)");
    expect(output).toContain("clipboard —");
    expect(output).not.toContain("sk-secret");
  });

  test("doctor validates OpenRouter keys against /key, not the public /models", async () => {
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        const path = new URL(request.url).pathname;
        if (path === "/v1/key") return Response.json({ data: { label: "test" } });
        if (path === "/v1/models") return new Response("public endpoint", { status: 200 });
        return new Response("not found", { status: 404 });
      },
    });
    servers.push(server);
    const path = await writeConfig(
      baseConfig(
        `  - name: openrouter\n    apiKey: sk-or-test\n    model: google/gemini-2.5-flash\n    apiUrl: http://127.0.0.1:${server.port}/v1`,
      ),
    );

    const { exit, output } = await Effect.runPromise(run(["--doctor", "--config-path", path]));

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(output).toContain("provider:openrouter — HTTP 200");
  });

  test("doctor fails when OpenRouter rejects the key", async () => {
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        const path = new URL(request.url).pathname;
        if (path === "/v1/key") return new Response('{"error":{"message":"User not found.","code":401}}', { status: 401 });
        if (path === "/v1/models") return Response.json({ data: [] });
        return new Response("not found", { status: 404 });
      },
    });
    servers.push(server);
    const path = await writeConfig(
      baseConfig(
        `  - name: openrouter\n    apiKey: sk-or-test\n    model: google/gemini-2.5-flash\n    apiUrl: http://127.0.0.1:${server.port}/v1`,
      ),
    );

    const { exit, output } = await Effect.runPromise(run(["--doctor", "--config-path", path]));

    expect(Exit.isFailure(exit)).toBe(true);
    expect(output).toContain("⛔️ provider:openrouter — HTTP 401 — authentication failed");
  });

  test("doctor fails when a provider rejects the key", async () => {
    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response("unauthorized", { status: 401 });
      },
    });
    servers.push(server);
    const path = await writeConfig(
      baseConfig(`  - name: google\n    apiKey: sk-secret\n    model: gemini-2.5-flash\n    apiUrl: http://127.0.0.1:${server.port}/v1`),
    );

    const { exit, output } = await Effect.runPromise(run(["--doctor", "--config-path", path]));

    expect(Exit.isFailure(exit)).toBe(true);
    expect(output).toContain("⛔️ provider:google — HTTP 401");
  });
});
