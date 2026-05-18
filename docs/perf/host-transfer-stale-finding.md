# Host Transfer Stale State — Finding & Resolution

> 두 폰 실측에서 발견된 host transfer 시나리오의 stale state 문제와 PR-01 → PR-01c 사이클로 잡힌 과정을 기록한다. 회귀 가드 + 향후 비슷한 패턴 진단 가이드.

## 시나리오

1. 민병희2가 1대1 대결 방을 생성한다 (host = 민병희2).
2. 민병희3이 초대를 수락하고 입장한다.
3. 민병희2(원래 host)가 방을 삭제(또는 나간다) → 시스템이 자동으로 민병희3을 host로 transfer.
4. 민병희3(새 host)이 방을 삭제한다 → 서버는 정리됨.

## 기대 동작

두 폰 모두:
- "파티런 대기실로 가기" sticky 버튼이 사라진다.
- 런닝 탭의 파티런 버튼이 정상 동작한다.
- 새 1대1 방을 바로 생성/입장할 수 있다.

## 실측에서 보인 증상 (PR-01 머지 후)

두 폰 모두:
- 서버 측 room은 정리됐지만 클라이언트 UI는 stale.
- "파티런 대기실로 가기" sticky 버튼 그대로.
- 런닝 탭 파티런 버튼이 deleted blocker로 막힘.
- 새 방 생성 시도 시 "이미 참여 중인 방이 있어요" 에러.

## 잡으려고 시도한 PR과 부분 결과

| PR | 변경 | 결과 |
|----|------|------|
| **PR-01** (#7) | deleted blocker / tombstone 1차 구축, delete verification helper 분리 | self-delete 케이스만 잡힘. host transfer는 미해결 |
| **PR-04** (#10) | active room check single-flight / abort / stale policy 분리 | active check 단계는 정리됐지만 host transfer stale은 여전 |
| **PR-01b** (#11) | snapshot key에 hostUserId/isHost 포함, `activeRoomResultHandler`가 `room: null` + 이전 roomId 감지 시 tombstone 전파 | 진단은 정확. 다만 client root state(`usePartyRunRoom.matchRoom`)로는 propagate되지 않아 UI는 그대로 stale |
| **PR-01c** (#12) | tombstone 이벤트 subscriber 추가, `setMatchRoom(null)`로 root state 직접 clear (Option A) | ✅ **해결**. 실측 통과 |

## Root cause

`PartyRunHomePanel`의 sticky "파티런 대기실로 가기" 버튼은 `visibleRoom` prop이 truthy일 때 표시된다. 그 source 추적:

```
PartyRunHomePanel.visibleRoom
  ← idle entry model.visibleMatchRoom
  ← usePartyRunRoom.visibleMatchRoom (useMemo)
  ← usePartyRunRoom.matchRoom (useState)
```

`matchRoom` state는 `setMatchRoom`으로만 갱신되는데, 코드베이스 전체에 **`setMatchRoom(null)` 호출이 한 군데도 없었음**. commit 한 곳에서만 set되고 그 이후엔 시간 기반 TTL stale로만 null 처리.

PR-01b가 추가한 tombstone marking + `activeRoomResultHandler`는 잘 동작했지만 `usePartyRunRoom`의 root state로는 propagate되지 않아 UI는 stale로 남았다.

## PR-01c가 잡은 방법 (Option A)

- `matchRoomDeletionTombstone.ts`에 subscriber 패턴 추가 (tombstone 적용 시 등록된 콜백 호출).
- `usePartyRunRoom`이 자기 자신 lifecycle 동안 subscribe하다가, 자기가 보고 있는 roomId가 tombstone되면 `setMatchRoom(null)` 호출.

이 방식이 Option B (visibility-only useMemo 가드)보다 안전한 이유: root state를 직접 비우니 다른 derived 경로(snapshot, runtime, race board 등)로 stale data가 재유입될 여지가 없다.

## 향후 비슷한 패턴 진단 체크리스트

1. **UI 텍스트로 컴포넌트 찾기**: 사용자가 본 stale UI 문자열을 grep해서 표시 조건을 찾는다.
2. **표시 조건의 prop을 backtrack**: prop → idle/runtime model → hook root state로 거슬러 올라간다.
3. **root state setter 호출처 grep**: `setX(null)` 또는 `clearX()` 호출이 모든 정리 경로에 존재하는지 확인. 없으면 root state는 stale될 수 있다.
4. **server response → root state propagation 경로** 확인: 우리 케이스처럼 response handler가 tombstone만 마킹하고 root state는 안 비우는 disconnect가 흔한 패턴.

## 회귀 테스트 시 시나리오

- Single-host delete: 민병희2 host → 민병희3 입장 → 민병희3 나가기 → 민병희2 삭제 → 두 폰 stale 없음 (PR-01 기존 동작)
- **Host transfer + new host delete**: 민병희2 host → 민병희3 입장 → 민병희2 삭제(transfer) → 민병희3 삭제 → 두 폰 stale 없음 (PR-01c 신규 케이스)
- Host가 leave로 빠지는 경로도 동일하게 transfer 트리거되는지 확인 권장.

## 관련 측정 메타

- 환경: 갤럭시 와이드 6 (Android 14) + 갤럭시 A9 (Android 10), 같은 와이파이, release 빌드
- 빌드: `./gradlew :app:assembleRelease`, install: `adb install -r -d` (두 폰)
- logcat 필터: `FATAL EXCEPTION|AndroidRuntime: (E|F)|^E ReactNativeJS|Choreographer.*Skipped [0-9]{2,}|ANR in com.minheee|Displayed com.minheee`
- 측정 가이드 상세: `docs/handoff/two-phone-measurement-guide.md` (PR #6)
