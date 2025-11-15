# Homebrew Release Playbook

## 1. 준비 작업
- `tsl` 저장소에서 버전을 갱신하고 태그할 커밋을 만든다 (`package.json` `version`: `0.1.0`).
- 별도의 Tap 저장소를 만든다 (예: `soomtong/homebrew-tap`) 후 `Formula/` 디렉터리를 생성한다.

## 2. GitHub Secrets
릴리스 워크플로(`Build Executables`)가 tag push(`v*`)에서 동작할 수 있도록 아래 시크릿을 설정한다.

| Secret | 설명 |
| --- | --- |
| `GH_PAT` | 선택. `contents:write` 권한이 있는 PAT. 없으면 기본 `GITHUB_TOKEN` 사용. |
| `HOMEBREW_TAP_REPO` | `<owner>/<repo>` 형식의 tap 저장소 슬러그. |
| `HOMEBREW_TAP_TOKEN` | tap 저장소에 push 가능한 PAT (`repo` scope). |
| `HOMEBREW_TAP_BRANCH` | 선택. tap 저장소 기본 브랜치가 `main`이 아니면 지정. |

## 3. 태그 릴리스
1. `npm version patch` (또는 `npm version minor|major`)로 `package.json`의 버전을 반드시 갱신하고 커밋한다.
2. `git push origin HEAD && git push origin v0.1.0`.
3. GitHub Actions가 자동으로 실행되어 다음을 수행한다.
   - macOS 바이너리를 빌드 (`bun run release`).
   - `dist/tsl-macos.tar.gz`와 `dist/homebrew/tsl.rb` 생성.
   - GitHub Release(`v0.1.0`) 생성 또는 업데이트, 산출물 첨부.
   - Tap 저장소의 `Formula/tsl.rb`를 최신 버전으로 커밋/푸시.

## 4. Homebrew에서 설치
배포된 tap은 아래 명령으로 설치 및 확인할 수 있다.

```bash
brew tap soomtong/homebrew-tap https://github.com/soomtong/homebrew-tap
brew info tsl
brew install tsl
```

## 5. 재실행/문제 해결
- 동일 태그에서 워크플로를 재실행하면 Release 업로드는 `gh release upload --clobber`로 갱신된다.
- Tap 업데이트 단계는 diff가 없을 경우 “Tap already up to date.” 메시지와 함께 성공적으로 종료된다.
- 필요 시 `HOMEBREW_TAP_REPO` 또는 토큰 환경을 변경해 다른 Tap으로 전환할 수 있다.

