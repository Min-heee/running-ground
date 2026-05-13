# Android 실시간 대결 화면 시작 흐름

Android에서 대결 화면에 진입하는 순간 RoadMotion, 참가자 위치 계산, 상대 기록 polling, 랭킹 계산, progress heartbeat가 한 번에 시작되면 JS thread가 잠깐 막힌 것처럼 느껴질 수 있습니다. 이번 흐름은 기록 정확도는 그대로 두고, 화면 진입 직후의 렌더링 부담만 2단계로 나눕니다.

## 변경 전후

| 구간 | 변경 전 | 변경 후 |
| --- | --- | --- |
| 화면 진입 직후 | 대결 화면, RoadMotion, 참가자 렌더, polling, 랭킹 계산이 동시에 시작 | Android만 최소 카드와 준비 shell을 먼저 렌더링 |
| heavy UI 시작 | 즉시 | Android에서 약 600ms 뒤 RoadMotion/참가자 도로 렌더링 시작 |
| 상대 기록 polling | 화면 진입과 동시에 interval 활성화 | Android startup gate가 열린 뒤 linked match/status polling 활성화 |
| progress heartbeat | 러닝 중 interval 기준 즉시 가능 | Android startup gate가 열린 뒤 heartbeat 재개 |
| GPS 원본 수집 | 기존 watcher 정책 | 변경 없음 |
| 저장 기록/승패 판정 | 기존 거리/시간/서버 공식 판정 | 변경 없음 |

## 2단계 진입 방식

1. **1단계, 즉시 렌더링**
   - 상단 탭, 대결 카드 제목, 요약 chip, 기권/종료 CTA는 먼저 표시합니다.
   - 사용자가 진입 직후 탭 전환이나 기권/뒤로가기를 누를 수 있게 JS thread 여유를 둡니다.

2. **2단계, 600ms 뒤 활성화**
   - RoadMotion과 참가자 도로 렌더링을 mount합니다.
   - 그룹 랭킹 계산과 상대 기록 polling을 시작합니다.
   - live progress heartbeat를 재개합니다.

## 적용 범위

- Android에서만 적용합니다.
- iOS는 기존 즉시 렌더링 흐름을 유지합니다.
- GPS 수집 주기, background tracking, 저장 snapshot 형식은 변경하지 않았습니다.

## 관련 파일

| 파일 | 역할 |
| --- | --- |
| `src/features/runs/hooks/useAndroidLiveMatchStartupGate.ts` | Android live match startup gate |
| `src/features/runs/TrackRunExperience.tsx` | gate 상태를 live match 계산, polling, heartbeat, arena 렌더에 전달 |
| `src/features/runs/hooks/useLiveMatchProgress.ts` | Android startup 중 그룹 랭킹 계산 지연 |
| `src/features/runs/hooks/partyRunSync/useLinkedMatchSync.ts` | startup 중 linked match polling 지연 |
| `src/features/runs/hooks/matchPolling/useBlockingMatchStatusPolling.ts` | startup 중 match status polling 지연 |
| `src/features/runs/hooks/useMatchProgressSync.ts` | startup 중 live progress heartbeat 지연 |
| `src/components/matches/LiveMatchArena.tsx` | startup 중 RoadMotion 대신 lightweight 준비 shell 표시 |

## QA 체크

- Android에서 대결 화면 진입 직후 탭/기권 버튼이 바로 눌리는지 확인합니다.
- 약 1초 안에 도로와 러너 동그라미가 정상 표시되는지 확인합니다.
- 기록 상세에 저장되는 거리/시간/페이스가 startup 지연 때문에 누락되지 않는지 확인합니다.
- iOS에서는 기존처럼 즉시 대결 화면이 표시되는지 확인합니다.
