# MEMORY

## Bun AOT 컴파일러 적용 보류 (2026-10-27)

- `bun build --compile --aot`는 oven-sh/bun PR #45631에만 있고 1.4.4 기준 미릴리스. 정식 릴리스 후 `build:bytecode:*`와 비교 측정하여 적용 여부 결정
- 비교 항목: startup 시간, RSS, 빌드 시간, 바이너리 크기, Effect 런타임 호환성
- 1.4.4 측정값 (`--version`): bytecode 없음 43.8ms, `--bytecode` 20.8ms, `--bytecode-order` 20.8ms, `--compile-jit-policy=4` 20.5ms
- 1.4.3의 `--bytecode-order`, `--compile-jit-policy`는 효과가 1ms 미만이고 order 파일 관리 부담이 있어 미적용
- 릴리스 빌드(`brew-release.ts`, GitHub Actions)는 이미 `--bytecode` 사용 중
