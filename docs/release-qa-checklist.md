# RunningGround Release QA Checklist

릴리즈 전에는 Android dev/preview, iOS TestFlight 조합으로 아래 항목을 끝까지 확인합니다. 특히 파티런/1대1 대결은 “기능 성공”뿐 아니라 화면 반응 속도와 stale 상태 정리까지 같이 봅니다.

## 0. 테스트 준비

- [ ] 테스트 계정 2개 이상 준비: 방장, 참가자
- [ ] Android 실기기 1대 이상 준비
- [ ] iOS TestFlight 기기 1대 이상 준비
- [ ] 두 기기가 같은 API 환경을 보는지 확인
- [ ] 기존 대결방/세션/큐/live share stale 상태가 없는지 확인
- [ ] Metro 또는 Logcat 로그 저장 준비

## 1. 로그인/회원가입

- [ ] 신규 회원가입이 완료된다
- [ ] 기존 계정 로그인이 완료된다
- [ ] 로그아웃 후 재로그인이 가능하다
- [ ] 잘못된 비밀번호/없는 계정에서 사용자 친화적인 오류가 보인다
- [ ] 앱 재시작 후 세션이 유지된다

## 2. API_BASE_URL 환경 확인

- [ ] 개발자 정보 또는 `[RG env]` 로그에서 `EXPO_PUBLIC_API_BASE_URL` 확인
- [ ] `EXPO_PUBLIC_USE_MOCK_API=false`인지 확인
- [ ] Android dev 앱 package id 확인
- [ ] iOS TestFlight bundle id 확인
- [ ] Android와 iOS가 같은 Preview 또는 Production API를 보고 있는지 확인
- [ ] 로그인 userId/nickname이 의도한 테스트 계정인지 확인

## 3. GPS 권한/백그라운드 권한

- [ ] 위치 권한 최초 요청이 정상 표시된다
- [ ] foreground 위치 권한 허용 후 단독 러닝이 시작된다
- [ ] background 위치 권한 안내가 정상 표시된다
- [ ] 권한 거부 시 안내 메시지가 보인다
- [ ] 권한 재허용 후 러닝 측정이 다시 가능하다
- [ ] Android에서 watcher/resource summary가 0~1개 수준으로 유지된다

## 4. 러닝 단독 기록

- [ ] 혼자 러닝 시작 버튼이 즉시 반응한다
- [ ] 측정 화면 진입 후 5초 카운트다운이 보인다
- [ ] 시간, 거리, 페이스가 갱신된다
- [ ] 일시정지/재개가 정상 동작한다
- [ ] 종료 후 기록 상세로 이동한다
- [ ] 저장된 거리, 시간, 페이스가 기록 상세와 목록에 반영된다

## 5. 1대1 방 생성

- [ ] 방 만들기 버튼이 1.5초 이내 반응한다
- [ ] 방 생성 후 대기실로 이동한다
- [ ] 방 코드와 거리 설정이 정상 표시된다
- [ ] 참가자 명단에 방장이 표시된다
- [ ] 이미 참여 중인 방이 없는데 blocker 메시지가 뜨지 않는다
- [ ] blocker가 있을 경우 stale cleanup 후 다시 시도 가능하다

## 6. 초대코드 입장

- [ ] 초대코드 입력 submit 로그가 한 번만 찍힌다
- [ ] room join API가 한 번만 호출된다
- [ ] 성공 응답에 `roomId`가 있고 대기실로 이동한다
- [ ] 잘못된 초대코드는 명확한 오류 메시지를 보여준다
- [ ] 삭제된 방 초대코드는 “방을 찾지 못했다” 계열 메시지를 보여준다
- [ ] `success:true`인데 `roomId:null`인 응답은 성공 처리되지 않는다

## 7. 친구 초대 입장

- [ ] 방장이 친구 초대 목록에서 자기 자신을 볼 수 없다
- [ ] 친구 선택 상태가 UI에 표시된다
- [ ] 초대 후 참가자 명단에 수락 대기 상태가 보인다
- [ ] 초대 받은 계정에 수락/거절 카드가 보인다
- [ ] 수락 시 대기실에 입장한다
- [ ] 거절 시 방장 화면 상태가 갱신된다

## 8. 카운트다운

- [ ] 방장이 시작을 누르면 두 기기 모두 로딩 상태가 보인다
- [ ] officialStartAt 확정 후 두 기기 카운트다운이 시작된다
- [ ] Android/iOS 카운트다운 오차가 허용 범위 안이다
- [ ] 카운트다운 중 화면이 running tab으로 튀지 않는다
- [ ] 20초 handoff 시점에 대결 화면으로 안정적으로 진입한다
- [ ] countdown ready ack가 중복 폭주하지 않는다

## 9. 대결 화면 진입

- [ ] live match 화면 최소 UI가 1.5초 이내 mount된다
- [ ] RoadMotion이 반복 mount/unmount 되지 않는다
- [ ] 대결 보기/순위 보기/기록 보기 탭 전환이 가능하다
- [ ] 대결 보기에서 상대 거리/페이스가 반영된다
- [ ] 순위 보기에서 현재 순위와 남은 거리가 표시된다
- [ ] 기록 보기 탭에서만 지도/기록 상세가 mount된다
- [ ] navigation `success:false`가 같은 matchId에서 반복되지 않는다

## 10. 기권/나가기

- [ ] 기권 버튼이 즉시 반응한다
- [ ] 내가 기권하면 내 기록이 저장되고 결과/상세 흐름으로 이동한다
- [ ] 상대 화면에서 내 동그라미가 빨간색/기권 상태로 표시된다
- [ ] 상대가 기권하면 내 버튼이 “러닝 종료하고 결과보기” 흐름으로 바뀐다
- [ ] 방 나가기/삭제는 화면 복귀를 먼저 처리한다
- [ ] 중복 클릭해도 API가 중복 실행되지 않는다

## 11. 방 삭제 후 stale 상태 확인

- [ ] 방 삭제 후 새 방 생성이 가능하다
- [ ] 방 나가기 후 새 1대1 매칭 신청이 가능하다
- [ ] `matchRooms`에 남은 active room이 없다
- [ ] `matchSessions`에 active participant가 남지 않는다
- [ ] `matchQueues.duel/group`에 테스트 유저가 남지 않는다
- [ ] `liveRunShares`에 진행 중 공유가 남지 않는다
- [ ] cleanup-stale 결과와 room create blocker 판단이 일치한다

## 12. Android 성능 로그 확인

- [ ] `[RG env]` 로그가 의도한 API 환경을 보여준다
- [ ] `active room check durationMs`가 5000ms 이상 반복되지 않는다
- [ ] `GPS tracking start durationMs`가 길어져도 UI가 block되지 않는다
- [ ] `background task start durationMs`가 길어져도 UI가 block되지 않는다
- [ ] `polling activeKindCount`가 일반적으로 1~2개 이하이다
- [ ] `heartbeat activeKindCount`가 1개 이하이다
- [ ] `watcher activeKindCount`가 0~1개 수준이다
- [ ] `LiveMatchContainer` 10초 렌더가 20회 미만이다
- [ ] `TrackRunExperience` 10초 렌더가 25회 미만이다
- [ ] 저장한 로그를 `npm run perf:trace-analyze -- <log-file>`로 분석한다

## 13. iOS TestFlight 확인

- [ ] TestFlight 앱이 정상 실행된다
- [ ] iOS에서 로그인/세션 유지가 정상이다
- [ ] iOS와 Android가 같은 API 서버를 본다
- [ ] iOS 단독 러닝 기록이 저장된다
- [ ] iOS 방장, Android 참가자 조합이 동작한다
- [ ] Android 방장, iOS 참가자 조합이 동작한다
- [ ] iOS Health/연동 관련 권한 화면이 깨지지 않는다

## 14. 기록 저장/포인트/랭킹 반영

- [ ] 단독 러닝 기록이 목록과 상세에 저장된다
- [ ] 1대1 대결 결과가 전적에 저장된다
- [ ] 기권/상대 기권 결과가 전적에 정확히 반영된다
- [ ] 그룹 대결 순위가 저장된다
- [ ] 포인트가 예상 규칙대로 적립된다
- [ ] 지역/친구 랭킹에 새 기록이 반영된다
- [ ] 마이페이지 활동 요약에 기록이 반영된다

## 최종 릴리즈 게이트

```bash
npm run typecheck
npm run lint
npm run test
npm run perf:smells
npm run backend:smoke
npm run release:gate:preview
```

- [ ] 위 명령어가 모두 통과한다
- [ ] Android 성능 로그에서 실패 기준이 없다
- [ ] iOS TestFlight 핵심 플로우가 통과한다
- [ ] Preview API와 앱 OTA/빌드 버전이 맞다
