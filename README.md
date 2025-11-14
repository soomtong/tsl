# tsl: Translator in console

한국어 프롬프트를 자동으로 영어로 번역해, 번역 결과를 클립보드에 복사하는 Bun 기반 CLI입니다. `effect-ts`로 부작용을 제어하고, YAML 설정 파일을 통해 모델·키·프롬프트 전략을 관리합니다.

## 주요 특징
- Bun + TypeScript + effect-ts 기반의 경량 CLI
- 한국어 입력 → 영어 번역 → 클립보드 복사 → 선택한 모델 호출까지 일괄 처리
- Provider 다중 선택 지원(OpenAI, OpenRouter, Gemini 등) 및 모델별 설정
- `tsl programming:en` 같은 도메인 프리셋으로 일관된 프롬프트 스타일 제공
- `--length` 옵션으로 다중 예제(샘플) 생성

## 시스템 요구 사항
- Bun >= 1.3
- TypeScript >= 5.8
- effect-ts, @effect/platform, @effect/ai for OpenAI/Gemini/OpenRouter SDK
- macOS 14+ (클립보드 제어 및 번역 툴링 확인용)

## 설치
[@effect/cli](https://github.com/Effect-TS/effect/tree/main/packages/cli) 패키지를 사용하고, `bun build --compile` 을 통해 단독 실행 파일을 제공함(node/bun 불필요)

```bash
# 1) 저장소 클론
git clone https://github.com/your-org/tsl.git
cd tsl

# 2) 의존성 설치
bun install

# 3) 첫 실행 전 초기화
bun run tsl --init
```

## 설정(YAML)
`npm start -- --init` 또는 `bun run tsl --init` 명령은 프로젝트 루트에 `~/.config/tsl.config.yaml`을 생성합니다. 수동 작성 예시는 아래와 같습니다.

```yaml
# tsl.config.yaml
providers:
  - name: openai
    apiKey: sk-...
    model: gpt-4.1-mini
  - name: gemini
    apiKey: g-...
    model: gemini-1.5-pro
  - name: openrouter
    apiKey: or-...
    model: meta-llama/llama-3-70b-instruct

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
| `tsl` | 인터랙티브 프롬프트 모드로 진입 |
| `tsl "어쩌구 저쩌구"` | 프롬프트 기반 target 언어로 번역 및 출력 |
| `tsl "어쩌구 저쩌구" --length 5` | 동일 프롬프트 기반 예제 5개 생성 출력|

### 사용 흐름
1. 사용자는 콘솔에서 한국어 프롬프트를 입력합니다.
2. CLI가 번역 프롬프트 템플릿과 effect-ts 파이프라인을 통해 영어로 변환합니다.
3. 번역된 결과는 클립보드에 자동 저장됩니다.
4. 선택된 Provider로 API 요청을 보내 응답을 출력/저장합니다.

## 개발 노트
- `effect-ts`는 번역 → 클립보드 → 모델 호출 단계를 순차적 Effect로 모델링하여 오류 처리를 단순화합니다.
- Provider 확장은 `providers/` 디렉터리에 드라이버를 추가하고 YAML에 매핑하면 됩니다.
- 테스트는 effect-ts mock layer를 이용해 번역/클립보드/HTTP를 분리해 작성합니다.

## Roadmap
- Provider 연결 상태 자동 점검(`tsl --doctor`)
- Prompt 템플릿 버전 관리 및 공유
- Git 훅과 연동하여 커밋 메시지 번역 자동화
- TSL 서버 모드(WebSocket)로 번역 결과 스트리밍

## 보안 & 운영
- API 키는 `.env` 또는 macOS Keychain에 저장하고 `tsl.config.yaml`에서는 `${ENV:VAR}` 형태로 참조합니다.
- 번역 및 모델 호출 로그에는 민감한 값을 남기지 않으며, 필요 시 `--redact` 옵션을 도입합니다.
- CLI 실행 결과를 팀과 공유할 때는 익명화된 prompt history만 사용합니다.

## 기여
1. 이슈 또는 제안 등록
2. 기능 브랜치에서 작업 후 PR 제출
3. Bun test, lint, typecheck 통과 여부를 CI에서 확인
