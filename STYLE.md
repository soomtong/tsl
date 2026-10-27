# 코딩 스타일

이 저장소는 [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)를
기준으로 삼습니다. 도구가 강제할 수 있는 규칙은 `biome.json`과 `tsconfig.json`에
넣었고, `bun run check`(typecheck + biome + test)가 CI 게이트입니다.
이 문서는 가이드 중 **이 프로젝트가 어떻게 적용했는지**와 **의도적으로 다르게 가는
지점**만 적습니다. 가이드 원문과 겹치는 설명은 반복하지 않습니다.

## 도구가 강제하는 규칙

| 가이드 항목 | 적용 방법 |
| --- | --- |
| 문자열은 작은따옴표 | `javascript.formatter.quoteStyle: "single"` |
| 자동 포맷 (gts/clang-format 기본 80열) | `formatter.lineWidth: 80`, 2칸 들여쓰기, 세미콜론 필수 |
| 단순 배열 타입은 `T[]` / `readonly T[]` | `style/useConsistentArrayType` (shorthand) |
| 객체 타입은 `type` 별칭 대신 `interface` | `style/useConsistentTypeDefinitions` (interface) |
| `switch`에는 항상 `default` | `style/useDefaultSwitchClause` |
| default export 금지 | `style/noDefaultExport` |
| `namespace` 금지 | `style/noNamespace` |
| 비-널 단언 `x!` 금지 | `style/noNonNullAssertion` |
| `any` 금지 | `suspicious/noExplicitAny` |
| `@ts-ignore` 계열 금지 | `suspicious/noTsIgnore` |
| `throw`는 `Error`만 | `style/useThrowOnlyError` |
| 선언은 한 줄에 하나 | `style/useSingleVarDeclarator` |
| 이름 규칙 (lowerCamelCase / UpperCamelCase / CONSTANT_CASE) | `style/useNamingConvention` |
| 안 쓰는 import·변수·매개변수 금지 | biome `noUnusedImports`/`noUnusedVariables` + tsconfig `noUnusedLocals`/`noUnusedParameters` |
| 모든 경로에서 값을 반환 | tsconfig `noImplicitReturns` |

`useNamingConvention`은 객체 리터럴 키에 한해 `snake_case`와 `CONSTANT_CASE`도
허용합니다. 외부 API의 와이어 포맷(`max_tokens`, `finish_reason`)과 환경 변수
(`PATH`)를 그대로 써야 하기 때문입니다.

## 리뷰에서 확인하는 규칙

도구로 잡기 어려운 항목은 코드 리뷰에서 봅니다.

- **함수 선언**: 이름 있는 최상위 함수는 `function foo() {}`로 씁니다.
  `const foo = () =>`는 콜백이나, 값이 함수가 아닌 Effect/Prompt/Flag처럼
  "함수가 아닌 값"일 때만 씁니다. (`readStdin`, `promptInput`, `*Option`처럼
  실행 전 Effect 값은 `const`가 맞습니다.)
- **타입 단언 최소화**: `as T`는 `Bun.YAML.parse(raw) as unknown`처럼 넓히는
  방향만 허용합니다. 좁힐 때는 타입 가드(`isPersonaKey`)나 스키마 디코딩을
  씁니다. 단언이 꼭 필요하면 이유를 주석으로 남깁니다.
- **`switch` 완전성**: `default`에는 `unreachable(value)`를 둡니다. 유니온에
  멤버가 추가되면 런타임이 아니라 컴파일 시점에 실패합니다.
- **내보내기 최소화**: 다른 모듈이나 테스트가 쓰지 않는 심볼은 `export`하지
  않습니다. 내보낸 심볼에는 이름이 말해 주지 않는 정보만 담은 짧은 JSDoc을 답니다.
- **오류는 도메인 오류로**: 사용자에게 보이는 실패는 `ConfigError`,
  `ProviderError`, `TranslationError`, `ClipboardError` 중 하나로 표현합니다.
  `new Error()`는 `unreachable`처럼 "일어날 수 없는" 경우에만 씁니다.
- **`const` 우선**: 재할당이 필요할 때만 `let`을 쓰고, 조건부 할당은 가능하면
  삼항식이나 `if/else if` 블록으로 바꿔 `let`을 없앱니다.
- **제어문 중괄호**: 한 줄에 들어가는 `if`만 중괄호를 생략할 수 있습니다
  (가이드 예외와 동일). 그 외에는 항상 블록을 씁니다.

## 가이드와 다르게 가는 지점 (Effect 관용구)

Effect v4 생태계 관용구와 충돌하는 부분은 Effect 쪽을 따릅니다. 이유는 같은
API를 다른 이름으로 감싸면 라이브러리 문서와 코드가 어긋나기 때문입니다.

| 항목 | 가이드 | 이 프로젝트 |
| --- | --- | --- |
| Schema 값 이름 | 변수는 lowerCamelCase | `ProviderConfigSchema`처럼 UpperCamelCase. 스키마는 타입과 값을 겸하며 `typeof X.Type`으로 타입을 뽑아 씁니다. |
| 서비스 태그 | — | `class AppConfigService extends Context.Service<…>()` 패턴을 그대로 씁니다. |
| 오류 클래스 | `Error` 상속 | `Schema.TaggedError`. `yield* new ConfigError(...)`로 실패를 표현합니다. |
| 네임스페이스 import | 자주 쓰는 심볼은 named import | `import * as Effect from 'effect/Effect'`처럼 Effect 문서 표기를 따릅니다. |
| JSON 모듈 | default export 금지 | `import packageJson from '../package.json'`은 JSON 모듈이므로 예외입니다. |
| 반환 타입 명시 | 저자 재량 | Effect 시그니처(`Effect.Effect<A, E, R>`)는 공개 함수에 명시합니다. 추론에 맡기면 요구 서비스(`R`)가 호출부로 새어 나가 읽기 어렵습니다. |

## 테스트

- 테스트는 `bun test`와 `bun:test` API만 씁니다.
- 플랫폼에 의존하는 바이너리(`pbcopy`)는 테스트에서 PATH 위의 쉼(shim)으로
  대체합니다. macOS 전용 바이너리가 없는 환경에서도 같은 결과가 나와야 합니다.
- 와이어 포맷을 흉내 내는 테스트 더블의 키(`finish_reason` 등)는 실제 API와
  같게 둡니다. 이름 규칙 예외가 여기에 해당합니다.
