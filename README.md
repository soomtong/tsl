# tsl: Translator in console

한국어 프롬프트를 영어로 번역해, 번역 결과를 클립보드에 복사하는 Bun 기반 CLI입니다. Effect v4로 부작용을 제어하고, YAML 설정 파일을 통해 모델·키·프롬프트 전략을 관리합니다.

## 주요 특징
- Bun + TypeScript + Effect v4 기반의 경량 CLI
- 한국어 입력 → 영어 번역 → 클립보드 복사 → 선택한 모델 호출까지 일괄 처리
- Provider 다중 선택 지원(OpenAI, Google Gemini, **OpenRouter 400+ 모델**) 및 모델별 설정
- `tsl --persona programming` 같은 도메인 프리셋으로 일관된 프롬프트 스타일 제공
- `--length` 옵션으로 다중 예제(샘플) 생성
- OpenRouter를 통한 무료 모델(`openrouter/free` 등) 및 다양한 AI 모델 접근
- `tsl --doctor`로 설정·Provider 연결·클립보드 상태 점검

## 시스템 요구 사항
- Bun >= 1.4
- TypeScript >= 5.9
- Effect v4 (모든 패키지 `4.0.6` 버전 정렬)
  - `effect@4.0.6` (`effect/cli`, `effect/ai`, `effect/FileSystem` 포함)
  - `@effect/platform-bun@4.0.6`
  - `@effect/ai-openai@4.0.6`
  - `@effect/ai-openrouter@4.0.6`
  - `@effect/ai-openai-compat@4.0.6` (Google Gemini OpenAI 호환 엔드포인트)
- macOS 14+ (클립보드 제어 및 번역 툴링 확인용)

## 설치
Effect v4의 `effect/cli` 모듈을 사용하고, `bun build --compile`을 통해 단독 실행 파일을 제공합니다. Node.js API는 사용하지 않습니다.

```bash
# 1) 저장소 클론
git clone https://github.com/your-org/tsl.git
cd tsl

# 2) 의존성 설치
bun install

# 3) 첫 실행 전 초기화
bun run src/main.ts --init
```

## 설정(YAML)
`bun run src/main.ts --init` 명령은 `~/.config/tsl/config.yaml`을 생성합니다. 설정 파일 탐색 순서는 `--config-path` > `$XDG_CONFIG_HOME/tsl/config.yaml` > `$HOME/.config/tsl/config.yaml`이며, `config.json` 등 다른 형식의 파일은 읽지 않습니다.

초기화 시 다음을 선택할 수 있습니다:
- **Provider**: OpenAI, Google Gemini, OpenRouter
- **Model** (OpenRouter 선택 시): 2026-10 기준 15개 큐레이션 모델 중 선택 (무료 모델 포함). 목록에 없으면 `config.yaml`에서 모델 ID를 직접 지정
- **Persona**: default, programming, research, review

기본 모델은 OpenAI `gpt-6-luna`, Google `gemini-3.8-flash`, OpenRouter `openrouter/free`입니다. OpenRouter 전체 모델은 `curl -s https://openrouter.ai/api/v1/models | jq -r '.data[].id'`로 확인할 수 있고, 큐레이션 목록에 없어도 `model`에 임의 ID를 지정할 수 있습니다.

수동 작성 예시는 아래와 같습니다.

```yaml
# tsl.config.yaml
providers:
  - name: openai
    apiKey: sk-...
    model: gpt-6-luna
  - name: google
    apiKey: g-...
    model: gemini-3.8-flash
  - name: openrouter
    apiKey: sk-or-...  # OpenRouter API key
    model: openrouter/free  # Free Models Router
    # 또는 다른 모델 ID:
    # model: openai/gpt-6.1-sol
    # model: anthropic/claude-sonnet-5.5
    # model: google/gemini-4-argon

translation:
  source: ko
  target: en
  autoCopyToClipboard: true
  formatter: >
    Please convert the Korean prompt into concise English that coding agents
    understand. Keep imperative mood.

profiles:
  default:
    temperature: 0.4
    maxTokens: 1024
  programming:
    temperature: 0.2
    styleHint: |
      Emphasize reproducible steps and include code if needed.
```

## 명령어

| 명령 | 설명 |
| ---- | ---- |
| `tsl --init` | 모델/키 선택 및 YAML 설정 파일 생성 |
| `tsl --config` | 현재 설정 파일 내용 확인 |
| `tsl --load-show` | main 프로그램이 로드한 설정 내용 확인 |
| `tsl --lang en "어쩌구 저쩌구"` | 단일 메시지 target 언어(en)로 번역 및 출력/클립보드 복사 |
| `tsl --persona programming --lang en "어쩌구 저쩌구"` | `programming` 프로필을 강제하고 target 언어(en)로 결과를 출력 |
| `tsl --prompt` | 선택 페르소나의 시스템 프롬프트와 temperature/maxTokens 등 세팅 출력 |
| `tsl --doctor` | 설정 경로/로드 상태, Provider 인증 엔드포인트(OpenAI/Google `/models`, OpenRouter `/key`), `pbcopy`, 무시되는 동명 파일(`config.json`/`config.yml`) 점검 (실패 시 exit 1) |
| `tsl --help` | 전체 플래그와 사용법 출력 |
| `tsl` | 인터랙티브 프롬프트 모드로 진입 |
| `tsl "어쩌구 저쩌구"` | 프롬프트 기반 target 언어로 번역 및 출력 (따옴표 생략 가능) |
| `tsl "어쩌구 저쩌구" --length 5` | 동일 프롬프트 기반 예제 5개 생성 출력|

공백이 포함된 문장은 따옴표 없이 그대로 입력할 수 있습니다. 여러 위치 인자는 공백 하나로 합쳐집니다.

```bash
tsl 인증 시스템을 구현해주세요
tsl --persona programming 인증 시스템을 구현해주세요 --length 2
```

플래그는 프롬프트 앞뒤 어디에나 올 수 있습니다. `tsl`만 실행하면 기존처럼 대화형 입력으로 진입합니다.

### 특수 문자가 포함된 문장
인자로 넘긴 문장은 tsl이 실행되기 전에 셸(zsh)이 먼저 해석합니다. 쉼표, 마침표, 콜론은 그대로 전달되지만 `?` `!` `;` `&` `(` `)` 등은 glob, history expansion, 명령 분리가 일어날 수 있습니다. 이런 문장은 셸을 거치지 않는 입력 경로를 사용하세요.

| 입력 방식 | 예시 |
| --- | --- |
| 대화형 프롬프트 | `tsl` 실행 후 한 줄 입력 |
| 클립보드 | 문장을 복사한 뒤 `tsl --clipboard` (또는 `tsl -c`) |
| stdin (heredoc/파이프) | 아래 예시 참고 |

```bash
tsl <<'EOF'
이거 뭐야? 와, 대단하다! 첫째; 둘째: 셋째 & (넷째)
EOF

pbpaste | tsl --length 2
```

입력 우선순위는 `--clipboard`, 위치 인자, 파이프된 stdin, 대화형 프롬프트 순서입니다. 클립보드나 stdin이 비어 있으면 오류로 종료합니다.

### 사용 흐름
1. 사용자는 콘솔에서 한국어 프롬프트를 입력합니다.
2. CLI가 번역 프롬프트 템플릿과 Effect 파이프라인을 통해 영어로 변환합니다.
3. 번역된 결과는 클립보드에 자동 저장됩니다.
4. 선택된 Provider로 API 요청을 보내 응답을 출력/저장합니다.

## 테스트 예제

### 시스템 프롬프트 확인

`--prompt` 옵션으로 현재 설정된 시스템 프롬프트와 매개변수를 확인할 수 있습니다:

```bash
$ ./dist/tsl --prompt --lang "Japanese"
```

```
🧑‍💼 [persona] programming — Strict coding assistant
🎯 [target language] Japanese
🌡️[temperature] 0.2
📏 [maxTokens] provider default
🎨 [styleHint] Emphasize reproducible steps and include code if needed.
⚙️[translation settings] source=ko autoCopy=on
🪄 [formatter]
Please convert the Korean prompt into concise English that coding agents understand. Keep imperative mood.
--- system prompt ---
You are a bilingual assistant that translates KO engineering requirements into concise JAPANESE instructions.

Please convert the Korean prompt into concise Japanese that coding agents understand. Keep imperative mood.

Persona directive: Translate with focus on code generation clarity, highlight required tooling and versions, avoid fluff.

Style hint: Emphasize reproducible steps and include code if needed.
```

### 다국어 번역 테스트

`--lang` 옵션을 사용하여 다양한 언어로 번역할 수 있습니다:

#### 테스트 1: 일본어 번역

```bash
$ ./dist/tsl --lang "Japanese" "사용자 인증 시스템을 구현해주세요"
```

```
🧑‍💼 [persona] programming — Strict coding assistant
🎯 [target] Japanese
📝 [translation]
ユーザー認証システムを実装してください。

✅ Copied translation to clipboard
```

#### 테스트 2: 스페인어 번역

```bash
$ ./dist/tsl --lang "Spanish" "데이터베이스 마이그레이션 스크립트를 작성해주세요"
```

```
🧑‍💼 [persona] programming — Strict coding assistant
🎯 [target] Spanish
📝 [translation]
Escribe un script de migración de base de datos.

✅ Copied translation to clipboard
```

#### 테스트 3: 영어 번역

```bash
$ ./dist/tsl --lang "English" "REST API 엔드포인트를 설계해주세요"
```

```
🧑‍💼 [persona] programming — Strict coding assistant
🎯 [target] English
📝 [translation]
Design a REST API endpoint.

✅ Copied translation to clipboard
```

#### 테스트 4: 프랑스어 번역

```bash
$ ./dist/tsl --lang "French" "테스트 코드를 작성해주세요"
```

```
🧑‍💼 [persona] programming — Strict coding assistant
🎯 [target] French
📝 [translation]
Rédigez le code de test.

✅ Copied translation to clipboard
```

#### 테스트 5: 독일어 번역

```bash
$ ./dist/tsl --lang "German" "에러 핸들링을 개선해주세요"
```

```
🧑‍💼 [persona] programming — Strict coding assistant
🎯 [target] German
📝 [translation]
Verbessern Sie die Fehlerbehandlung.

✅ Copied translation to clipboard
```

#### 테스트 6: 중국어 번역

```bash
$ ./dist/tsl --lang "Chinese" "캐싱 전략을 최적화해주세요"
```

```
🧑‍💼 [persona] programming — Strict coding assistant
🎯 [target] Chinese
📝 [translation]
优化缓存策略。

✅ Copied translation to clipboard
```

## 개발 노트
- Effect v4는 `effect/cli`, `effect/ai`, `effect/FileSystem`, `effect/http` 모듈을 사용합니다. `@effect/cli`, `@effect/ai` 별도 패키지는 v4에 존재하지 않습니다.
- 서비스는 `Context.Service`, 도메인 오류는 `Schema.TaggedError`, 설정 파싱은 `effect/Schema`로 구현합니다.
- Provider는 `LanguageModel.LanguageModel` 레이어로 추상화합니다.
  - OpenAI: `@effect/ai-openai` (Responses API)
  - OpenRouter: `@effect/ai-openrouter` (Chat Completions)
  - Google Gemini: `@effect/ai-openai-compat` + `https://generativelanguage.googleapis.com/v1beta/openai`
- 테스트는 `bun test`와 Effect 레이어(`LanguageModel`, `Clipboard`, `FileSystem`)로 번역/클립보드/HTTP를 분리합니다.
- CLI 통합 테스트는 `Command.runWith`와 실제 `BunServices.layer` 위에서 `TestConsole`로 출력을 검증합니다.
- 구조와 의존성 규칙은 `docs/architecture.md`를 참고하세요.
- 변경 후 `bun run check`(typecheck + biome + test)로 검증합니다.
- Homebrew 배포 및 릴리스 자동화는 `docs/homebrew-release.md`를 참고하세요.

## Roadmap
- Prompt 템플릿 버전 관리 및 공유
- Git 훅과 연동하여 커밋 메시지 번역 자동화
- TSL 서버 모드(WebSocket)로 번역 결과 스트리밍

## 보안 & 운영
- API 키는 `.env` 또는 macOS Keychain에 저장하고 `tsl.config.yaml`에서는 `${ENV:VAR}` 형태로 참조합니다.
- `--load-show`는 해석된 설정을 출력할 때 `apiKey`를 `***`로 마스킹합니다.
- 번역 및 모델 호출 로그에는 민감한 값을 남기지 않습니다.
- CLI 실행 결과를 팀과 공유할 때는 익명화된 prompt history만 사용합니다.

## 기여
1. 이슈 또는 제안 등록
2. 기능 브랜치에서 작업 후 PR 제출
3. `bun run check`(typecheck + biome + test) 통과 여부를 CI에서 확인
