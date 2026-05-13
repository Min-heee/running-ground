# 출시 전 코드 품질 체크리스트

이 문서는 Preview 배포와 앱 업데이트 전에 실행할 코드 품질 게이트를 한 곳에 모은 체크리스트입니다. 기능을 자동 수정하지 않고, 타입/린트/테스트/성능 냄새/백엔드 smoke/Preview gate를 순서대로 확인합니다.

## 필수 실행 순서

```bash
npm run typecheck
npm run lint
npm run test
npm run perf:smells
npm run backend:smoke
npm run release:gate:preview
```

## 명령어별 목적

| 순서 | 명령어 | 목적 |
| --- | --- | --- |
| 1 | `npm run typecheck` | TypeScript 타입 오류, 깨진 import, 잘못된 props/응답 타입을 먼저 잡습니다. |
| 2 | `npm run lint` | 사용하지 않는 변수/import, hook dependency, 코드 스타일 위험을 확인합니다. |
| 3 | `npm run test` | 러닝, 매칭, 포인트, 리그, 마켓 등 순수 도메인 로직 회귀를 확인합니다. |
| 4 | `npm run perf:smells` | Android 렉 후보인 `ScrollView + map`, cleanup 누락, 과도한 계산, 위치/지도 업데이트 후보를 문서화합니다. |
| 5 | `npm run backend:smoke` | 백엔드 핵심 API 흐름이 실행 가능한지 smoke 테스트로 확인합니다. |
| 6 | `npm run release:gate:preview` | Preview 배포 전 환경변수, 공개 API, release gate 조건을 최종 확인합니다. |

## 실패했을 때 먼저 볼 파일

| 실패 명령어 | 우선 확인 위치 |
| --- | --- |
| `npm run typecheck` | 오류에 표시된 `src/**`, `app/**`, `src/lib/api/types/**`, `src/domain/**` |
| `npm run lint` | 오류에 표시된 파일, hook dependency는 `src/features/runs/**`와 화면 hook 우선 확인 |
| `npm run test` | 실패한 `src/**/*.test.ts`, 관련 순수 로직 파일 |
| `npm run perf:smells` | `docs/android-performance-regression-check.md`, `scripts/check-performance-smells.mjs` |
| `npm run backend:smoke` | `backend/src/smoke.mjs`, `backend/src/server.mjs`, `backend/src/routes/**` |
| `npm run release:gate:preview` | `scripts/run-release-gate.mjs`, `scripts/validate-release-env.mjs`, `.env.preview`, EAS preview 환경 |

## Android Preview 빌드 전 체크

- `npm run perf:smells` 결과에서 High 항목이 새로 생기지 않았는지 확인합니다.
- 파티런/대결 화면 변경이 있으면 Android 실기기에서 카운트다운, 대결 화면 전환, 상대 기록 반영, 기권 흐름을 다시 확인합니다.
- 위치 추적 변경이 있으면 watcher 중복 등록과 화면 이탈 cleanup을 확인합니다.
- 긴 목록 화면 변경이 있으면 `FlatList` 적용 여부와 `keyExtractor` 안정성을 확인합니다.

## iOS TestFlight 빌드 전 체크

- `npm run typecheck`, `npm run lint`, `npm run test`를 모두 통과한 커밋인지 확인합니다.
- 파티런/대결 관련 변경이 있으면 iOS 2대 또는 iOS + Android 조합으로 초대, 카운트다운, 기록 측정, 결과 저장을 확인합니다.
- Health/연동 관련 변경이 있으면 권한 팝업, 연결 상태, 가져오기 결과 메시지를 확인합니다.
- OTA 업데이트만으로 반영 가능한 변경인지, native 설정 변경으로 새 빌드가 필요한지 확인합니다.

## 운영 메모

- `perf:smells`는 자동 수정 도구가 아닙니다. 성능 냄새 후보를 찾아 문서로 남기고, 수정은 별도 리팩토링 작업에서 진행합니다.
- Preview 배포 직전에는 위 명령어를 순서대로 실행하고, 실패한 단계가 있으면 다음 단계로 넘어가지 않습니다.
