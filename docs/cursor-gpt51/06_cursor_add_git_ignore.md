# Add git ignore
_Exported on 11/15/2025 at 04:52:27 GMT+9 from Cursor (2.0.77)_

---

**User**

add git ignore

---

**Cursor**

```ignore
/.DS_Store
/dist/
/out/
/node_modules/
/.pnp/
/.pnp.js

# Environment
.env
.env.*.local

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# Bun / Typescript
*.tsbuildinfo
# dependencies (bun install)
node_modules

# output
out
dist
*.tgz

# code coverage
coverage
*.lcov

# logs
logs
_.log
report.[0-9]_.[0-9]_.[0-9]_.[0-9]_.json

# dotenv environment variable files
.env
.env.development.local
.env.test.local
.env.production.local
.env.local

# caches
.eslintcache
.cache
*.tsbuildinfo

# IntelliJ based IDEs
.idea

# Finder (MacOS) folder config
.DS_Store

```

## 작업 요약
- `/.gitignore`을 추가해 빌드 출력(`dist/`, `out/`), 종속성 캐시(`node_modules/`, Bun/PnP 파일), 로그, 환경 설정 파일 등을 무시하도록 설정했습니다.

## 테스트
- 실행하지 않음 (필요하면 `bun test` 사용).

