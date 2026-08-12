// 러닝 트래커의 "지금 기록 중인가"를 러닝 탭 밖(홈/레이스 탭의 아레나 자동 핸드오프)에서
// 읽기 위한 모듈 레벨 미러. 근원은 useRunTracking의 status 하나뿐이고, 여기는 그 스냅샷이다.
//
// 왜 필요한가 (적대 검증 2026-08-11): 런타임 자체의 카운트다운 핸드오프는 isIdle로 게이트되어
// 있는데(shouldAutoFocusMatchArena), 홈의 핸드오프가 이 게이트 없이 발동하면 출발 25초 전에
// 워밍업 솔로런을 기록 중인 화면 위로 아레나가 강제로 열린다. 기록 중이면 자동 핸드오프는
// 포기한다(수동 진입은 언제나 가능) — 이전의 "홈에 머무름"과 같은 안전한 강등.
let trackerBusy = false;

export function setGlobalTrackerBusy(busy: boolean): void {
  trackerBusy = busy;
}

export function isGlobalTrackerBusy(): boolean {
  return trackerBusy;
}

export function __resetGlobalTrackerBusyForTest(): void {
  trackerBusy = false;
}
