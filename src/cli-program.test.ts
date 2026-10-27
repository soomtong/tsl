import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from 'bun:test';
import { BunServices } from '@effect/platform-bun';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as FetchHttpClient from 'effect/http/FetchHttpClient';
import * as Layer from 'effect/Layer';
import * as Stdio from 'effect/Stdio';
import * as Stream from 'effect/Stream';
import { TestConsole } from 'effect/testing';
import { runCli } from './cli-program';

const tmpDirs: string[] = [];
const servers: Array<{ stop: (force?: boolean) => void }> = [];
const tmpRoot = Bun.env.TMPDIR ?? '/tmp';

// The doctor check looks for `pbcopy` on PATH, which only macOS ships.
// A no-op shim keeps the suite deterministic on Linux CI and dev boxes.
const shimDir = `${tmpRoot}/tsl-shim-${crypto.randomUUID()}`;
const originalPath = Bun.env.PATH;

const testLayer = Layer.mergeAll(
  BunServices.layer,
  FetchHttpClient.layer,
  TestConsole.layer,
);

async function writeConfig(contents: string): Promise<string> {
  const dir = `${tmpRoot}/tsl-cli-${crypto.randomUUID()}`;
  const path = `${dir}/config.yaml`;
  await Bun.write(path, contents);
  tmpDirs.push(dir);
  return path;
}

const baseConfig = (providerLine: string, extra = '') => `providers:
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

function run(args: readonly string[], stdin?: string) {
  return Effect.gen(function* () {
    const exit = yield* Effect.exit(runCli(args));
    const logs = yield* TestConsole.logLines;
    const errors = yield* TestConsole.errorLines;
    return {
      exit,
      output: logs.map(String).join('\n'),
      errors: errors.map(String).join('\n'),
    };
  }).pipe(
    Effect.provide(
      stdin === undefined
        ? testLayer
        : Layer.merge(
            testLayer,
            Stdio.layerTest({
              stdin: Stream.make(new TextEncoder().encode(stdin)),
              stdinIsTerminal: Effect.succeed(false),
            }),
          ),
    ),
  );
}

beforeAll(async () => {
  const shim = `${shimDir}/pbcopy`;
  await Bun.write(shim, '#!/bin/sh\ncat >/dev/null\n');
  Bun.spawnSync(['chmod', '755', shim]);
  Bun.env.PATH = `${shimDir}:${originalPath ?? ''}`;
});

afterAll(() => {
  Bun.env.PATH = originalPath;
  Bun.spawnSync(['rm', '-rf', shimDir]);
});

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.stop(true);
  }
  for (const dir of tmpDirs.splice(0)) {
    Bun.spawnSync(['rm', '-rf', dir]);
  }
});

describe('runCli', () => {
  test('prints the raw config file', async () => {
    const path = await writeConfig(
      baseConfig(
        '  - name: openai\n    apiKey: sk-test\n    model: gpt-4o-mini',
      ),
    );
    const { exit, output } = await Effect.runPromise(
      run(['--config', '--config-path', path]),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(output).toContain(`--- ${path} ---`);
    expect(output).toContain('name: openai');
  });

  test('prints resolved prompt settings', async () => {
    const path = await writeConfig(
      baseConfig(
        '  - name: openai\n    apiKey: sk-test\n    model: gpt-4o-mini',
      ),
    );
    const { exit, output } = await Effect.runPromise(
      run(['--prompt', '--config-path', path]),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(output).toContain('persona] programming');
    expect(output).toContain('maxTokens] 128');
    expect(output).toContain('Style hint: Test hint');
  });

  test('rejects a zero sample count', async () => {
    const path = await writeConfig(
      baseConfig(
        '  - name: openai\n    apiKey: sk-test\n    model: gpt-4o-mini',
      ),
    );
    const { exit } = await Effect.runPromise(
      run(['--length', '0', 'hello', '--config-path', path]),
    );

    expect(Exit.isFailure(exit)).toBe(true);
  });

  test('doctor reports provider and clipboard status', async () => {
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        return new URL(request.url).pathname === '/v1/models'
          ? Response.json({ object: 'list', data: [] })
          : new Response('not found', { status: 404 });
      },
    });
    servers.push(server);
    const path = await writeConfig(
      baseConfig(
        `  - name: google\n    apiKey: sk-secret\n    model: gemini-2.5-flash\n    apiUrl: http://127.0.0.1:${server.port}/v1`,
      ),
    );
    const ignoredPath = `${path.replace(/\/config\.yaml$/, '')}/config.json`;
    await Bun.write(ignoredPath, '{}');

    const { exit, output } = await Effect.runPromise(
      run(['--doctor', '--config-path', path]),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(output).toContain(
      `config — 1 provider(s), persona programming — ${path}`,
    );
    expect(output).toContain('ignored config:');
    expect(output).toContain('config.json (only config.yaml is loaded)');
    expect(output).toContain('provider:google — HTTP 200 (gemini-2.5-flash)');
    expect(output).toContain(`✅ clipboard — ${shimDir}/pbcopy`);
    expect(output).not.toContain('sk-secret');
  });

  test('doctor validates OpenRouter keys against /key, not the public /models', async () => {
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        const path = new URL(request.url).pathname;
        if (path === '/v1/key')
          return Response.json({ data: { label: 'test' } });
        if (path === '/v1/models')
          return new Response('public endpoint', { status: 200 });
        return new Response('not found', { status: 404 });
      },
    });
    servers.push(server);
    const path = await writeConfig(
      baseConfig(
        `  - name: openrouter\n    apiKey: sk-or-test\n    model: google/gemini-2.5-flash\n    apiUrl: http://127.0.0.1:${server.port}/v1`,
      ),
    );

    const { exit, output } = await Effect.runPromise(
      run(['--doctor', '--config-path', path]),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(output).toContain('provider:openrouter — HTTP 200');
  });

  test('doctor fails when OpenRouter rejects the key', async () => {
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        const path = new URL(request.url).pathname;
        if (path === '/v1/key')
          return new Response(
            '{"error":{"message":"User not found.","code":401}}',
            { status: 401 },
          );
        if (path === '/v1/models') return Response.json({ data: [] });
        return new Response('not found', { status: 404 });
      },
    });
    servers.push(server);
    const path = await writeConfig(
      baseConfig(
        `  - name: openrouter\n    apiKey: sk-or-test\n    model: google/gemini-2.5-flash\n    apiUrl: http://127.0.0.1:${server.port}/v1`,
      ),
    );

    const { exit, output } = await Effect.runPromise(
      run(['--doctor', '--config-path', path]),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(output).toContain(
      '⛔️ provider:openrouter — HTTP 401 — authentication failed',
    );
  });

  test('doctor fails when a provider rejects the key', async () => {
    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response('unauthorized', { status: 401 });
      },
    });
    servers.push(server);
    const path = await writeConfig(
      baseConfig(
        `  - name: google\n    apiKey: sk-secret\n    model: gemini-2.5-flash\n    apiUrl: http://127.0.0.1:${server.port}/v1`,
      ),
    );

    const { exit, output } = await Effect.runPromise(
      run(['--doctor', '--config-path', path]),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(output).toContain('⛔️ provider:google — HTTP 401');
  });

  test('joins unquoted prompt tokens and still parses later flags', async () => {
    let captured = '';
    let calls = 0;
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        if (new URL(request.url).pathname !== '/v1/chat/completions') {
          return new Response('not found', { status: 404 });
        }
        const body = (await request.json()) as {
          messages?: Array<{ content?: unknown }>;
          model: string;
        };
        captured = (body.messages ?? [])
          .map((message) =>
            typeof message.content === 'string'
              ? message.content
              : JSON.stringify(message.content),
          )
          .join('\n');
        calls += 1;
        return Response.json({
          id: `chatcmpl-${calls}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: body.model,
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: `translated-${calls}` },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
        });
      },
    });
    servers.push(server);
    const path = await writeConfig(
      baseConfig(
        `  - name: google\n    apiKey: sk-test\n    model: gemini-2.5-flash\n    apiUrl: http://127.0.0.1:${server.port}/v1`,
      ),
    );

    const { exit, output } = await Effect.runPromise(
      run([
        '인증',
        '시스템을',
        '구현해주세요',
        '--length',
        '2',
        '--config-path',
        path,
      ]),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(captured).toContain('인증 시스템을 구현해주세요');
    expect(output).toContain('translated-1');
    expect(output).toContain('translated-2');
  });

  test('reads the prompt from piped stdin with shell-special characters intact', async () => {
    let captured = '';
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        const body = (await request.json()) as {
          messages?: Array<{ content?: unknown }>;
          model: string;
        };
        captured = (body.messages ?? [])
          .map((message) => String(message.content))
          .join('\n');
        return Response.json({
          id: 'chatcmpl-stdin',
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: body.model,
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'translated-stdin' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
        });
      },
    });
    servers.push(server);
    const path = await writeConfig(
      baseConfig(
        `  - name: google\n    apiKey: sk-test\n    model: gemini-2.5-flash\n    apiUrl: http://127.0.0.1:${server.port}/v1`,
      ),
    );
    const sentence = '이거 뭐야? 와, 대단하다! 첫째; 둘째: 셋째 & (넷째)';

    const { exit, output } = await Effect.runPromise(
      run(['--config-path', path], `${sentence}\n`),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(captured).toContain(sentence);
    expect(output).toContain('translated-stdin');
  });

  test('fails when piped stdin is empty', async () => {
    const path = await writeConfig(
      baseConfig(
        '  - name: openai\n    apiKey: sk-test\n    model: gpt-4o-mini',
      ),
    );
    const { exit } = await Effect.runPromise(
      run(['--config-path', path], '  \n'),
    );

    expect(Exit.isFailure(exit)).toBe(true);
  });
});
