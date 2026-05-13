# 실시간 대결 업데이트 주기

실시간 대결은 기록 정확도와 화면 부하를 분리해서 관리합니다. GPS 원본 수집과 저장용 기록은 기존 흐름을 유지하고, 서버 동기화와 화면 표시만 별도 주기로 제한합니다.

## 변경 전후 요약

| 영역 | 변경 전 | 변경 후 | 영향 |
| --- | --- | --- | --- |
| GPS 원본 수집 | 기존 foreground/background watcher 정책 | 변경 없음 | 저장되는 거리, 시간, 페이스 정확도 유지 |
| live progress heartbeat | 2.0초 | 2.5초 | 서버 전송 횟수를 줄이고 2~3초 기준 유지 |
| 1대1/그룹 상대 기록 polling | iOS 2.0초, Android 2.5초 | 공통 2.5초 | 플랫폼별 흔들림을 줄이고 서버 sync cadence 통일 |
| 파티런 방 빠른 polling | iOS 1.0초, Android 1.5초 | 공통 2.5초 | 대기실/카운트다운 중 서버 요청 빈도 감소 |
| Android UI 표시 frame | 1.0초 | 1.5초 | Android live match 화면의 JS thread 부담 감소 |
| iOS UI 표시 frame | 즉시 반영 | 변경 없음 | iOS 체감 반응성 유지 |

## 원칙

- GPS watcher 주기는 임의로 크게 바꾸지 않습니다.
- 저장되는 러닝 기록은 원본 tracking snapshot을 기준으로 유지합니다.
- 승패와 순위 판정은 서버 공식 progress와 기존 비교 로직을 유지합니다.
- 화면 표시용 frame만 Android에서 throttle합니다.
- match view model, progress, ranking 계산은 표시 frame이나 서버 snapshot 입력이 바뀔 때만 다시 계산되도록 `useMemo` 경계를 둡니다.

## 관련 파일

| 파일 | 역할 |
| --- | --- |
| `src/features/runs/liveMatchCadence.ts` | 실시간 대결 server/UI cadence 상수 |
| `src/features/runs/matchProgressSync.ts` | live progress heartbeat 주기 |
| `src/features/runs/hooks/useAndroidLiveMatchDisplayFrame.ts` | Android 표시용 distance/pace frame throttle |
| `src/features/runs/TrackRunExperience.tsx` | live match polling cadence 적용과 view props 안정화 |
| `src/features/runs/hooks/useLiveMatchProgress.ts` | progress/ranking 계산 memoization |

## QA 체크

- Android + iOS 파티런 1대1에서 카운트다운, 대결 화면 진입, 거리 표시가 1~2초 단위로 자연스럽게 갱신되는지 확인합니다.
- 실제 이동 거리 저장값이 화면 표시 throttle과 다르게 누락되지 않는지 기록 상세에서 확인합니다.
- 상대 기록이 최대 2~3초 지연으로 반영되는지 확인합니다.
- 기권, 종료, 결과 저장 버튼 반응이 느려지지 않았는지 확인합니다.
