# Live Match Progress Sync

파티런/1대1/그룹 대결에서 거리와 페이스가 화면에 보이는 흐름은 세 단계로 나뉩니다.

1. 클라이언트 측정값 생성

- 위치 측정은 `backgroundTracking.ts`가 담당합니다.
- 화면/서버에 보낼 값은 `TrackRunExperience.tsx`의 `buildDisplayedMatchProgress`에서 만듭니다.
- 대결 카운트다운 웜업 중에는 `officialStartBaseline`과 `trackingDisplayModel.ts`가 공식 시작 전 거리를 0으로 보정합니다.
- 서버로 보낼 pace는 `normalizeMatchProgressPace`로 보정해서 `--:--/km` 대신 평균 페이스 fallback을 사용합니다.

2. 서버 전송 및 상태 반영

- `useMatchProgressSync`가 `updateRunningMatchProgress` 호출을 담당합니다.
- 전송 주기는 기본 2초입니다. 앱이 백그라운드/포그라운드로 바뀔 때도 lifecycle status를 한 번 더 전송합니다.
- 전송 성공 시 `lastSyncedMatchProgress`에 내 최신 전송값을 저장합니다.
- 서버 응답으로 받은 `RunningMatchStatusResponse`는 현재 match id에 맞춰 `duelMatchStatus` 또는 `groupMatchStatus`에 반영됩니다.
- 파티런 linked match도 같은 경로를 씁니다. `roomLinkedMatchContext.matchId`와 전송한 `matchId`가 같으면 해당 mode의 match status를 갱신합니다.

3. 화면 표시값 선택

- `useLiveMatchProgress`가 서버 응답과 마지막 전송값을 모아 화면용 상태를 만듭니다.
- 내 기록은 서버 echo가 늦을 수 있어서 `lastSyncedMatchProgress`를 fallback으로 씁니다.
- 상대 기록은 `opponent` 또는 `participants`의 `liveDistanceKm`, `liveElapsedSeconds`, `livePace`, `officialDistanceKm` 필드를 봅니다.
- `buildMatchProgressModel`은 표시값을 아래 우선순위로 고릅니다.
- `officialProgress`: 서버 공식 판정이 준비된 값입니다. 가장 우선합니다.
- `rawProgress`: 상대/참가자의 실시간 live distance 값입니다.
- `estimated`: distance가 없고 elapsed + pace만 있을 때 임시 추정한 값입니다.
- `empty`: 서버에도 아직 표시 가능한 값이 없는 상태입니다.

## 상대 거리가 안 보일 때 확인 순서

1. 내 폰에서 `useMatchProgressSync`가 2초마다 `updateRunningMatchProgress`를 호출하는지 확인합니다.
2. API 응답의 `matchId`가 현재 대결 화면의 `duelMatchStatus.matchId`, `groupMatchStatus.matchId`, `roomLinkedMatchContext.matchId` 중 하나와 같은지 확인합니다.
3. 상대 폰도 같은 `matchId`로 progress를 보내고 있는지 확인합니다.
4. 서버 응답의 `opponent.liveDistanceKm` 또는 `participants[].liveDistanceKm`가 증가하는지 확인합니다.
5. `officialComparison.readyParticipantCount`가 2명 이상인지 확인합니다. 공식 판정이 준비되면 `officialProgress`가 우선 표시됩니다.
6. 값이 서버 응답에는 있는데 화면에만 안 보이면 `buildMatchProgressModel(...).displayProgress.source`가 `official`, `raw`, `estimated`, `empty` 중 무엇인지 확인합니다.
7. 파티런이면 `roomLinkedMatchContext.mode`가 현재 `matchMode`와 같은지 확인합니다. 다르면 progress target을 못 잡습니다.

## 관련 파일

- `src/features/runs/hooks/useMatchProgressSync.ts`: progress 전송, heartbeat, 서버 응답 반영
- `src/features/runs/matchProgressSync.ts`: progress 전송 판단 순수 로직
- `src/features/runs/hooks/useLiveMatchProgress.ts`: 서버 응답을 대결 화면 상태로 변환
- `src/features/runs/matchProgress.ts`: `rawProgress`, `officialProgress`, `displayProgress` 계산
- `src/features/runs/trackingDisplayModel.ts`: 공식 시작 전 거리/초반 GPS 노이즈 보정
