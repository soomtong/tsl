---
description: Use Bun instead of Node.js, npm, pnpm, or vite.
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: false
---

Default to using Bun instead of Node.js.

Provide OPENAI_API_KEY in env `env -u $OPENAI_API_KEY` then run bun execution.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun add` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## CLI / Console Apps

- 기본 진입점은 `bun run path/to/cli.ts` 또는 `bun build --compile`로 생성한 단일 실행 파일을 사용합니다.
- 인자 파싱은 `Bun.argv` 또는 `process.argv.slice(2)`를 활용하고, 별도 패키지 없이 필요 시 간단한 헬퍼 함수를 작성합니다.
- 입출력은 `console.log` / `console.error`를 기본으로 하되, 파일 I/O 시 `Bun.file` 및 `Bun.write`를 우선 고려합니다.
- 외부 명령 실행이 필요하면 `Bun.$\`cmd\`` 또는 `Bun.spawn`/`Bun.spawnSync`를 사용합니다.
- 장기 실행 CLI는 `setInterval` 대신 Effect, Stream 등을 사용해 자원 해제를 명시적으로 처리합니다.
- 테스트는 `bun test`와 `bun:test` API로 작성하며, CLI 시나리오는 `spawn`을 통해 통합 테스트합니다.
- 배포 대상이 단일 바이너리일 경우 `bun build --compile src/entry.ts --outfile dist/app` 패턴을 사용합니다.

추가 API 상세는 `node_modules/bun-types/docs/**.md`를 참고하세요.

## Commit

Make commit: no prefix, Capital started. less than 80 length.
use OPENAI GPT-5.1 Codex Mini