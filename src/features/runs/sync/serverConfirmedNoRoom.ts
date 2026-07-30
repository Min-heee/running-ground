// "서버가 방이 없다고 답했다"는 사실의 기록 (적대 검증 2차에서 나온 결함).
//
// 빈 대기실 화해는 서버 상태를 바꾸는 자동 동작이라, 트리거가 '증거의 부재'면 안 된다.
// loading===false && room===null 은 "서버가 없다고 답했다"뿐 아니라 "아직 성공한 조회가
// 한 번도 없다"로도 만들어진다: /rooms/my 하드 타임아웃(3s), 응답 지연으로 인한
// stale-generation 스킵, fetch 예외, 진입 직후 입력창(1.2s) 억제 — 이 경우 전부
// commitRoom이 호출되지 않은 채 loading만 finally에서 꺼진다. 그 상태를 분기로 오해하면
// 조회 한 번 실패한 것만으로 멀쩡한 내 대기방이 지워진다(실제 모듈로 재현됨).
//
// 그래서 화해는 '서버 응답이 실제로 도착했고 그 응답에 방이 없었다'는 양성 신호를 요구한다.
// 이 모듈이 그 신호 한 개를 들고 있는다.

let serverConfirmedNoRoomAtMs: number | null = null;

// activeRoomResultHandler가 payload.room === null 로 commitRoom(null)을 하는 지점에서 호출.
export function markServerConfirmedNoRoom(nowMs = Date.now()) {
  serverConfirmedNoRoomAtMs = nowMs;
}

// 방을 실제로 받았거나(=분기가 아니다) 화면을 떠날 때 호출해 신호를 무효화한다.
export function clearServerConfirmedNoRoom() {
  serverConfirmedNoRoomAtMs = null;
}

// sinceMs(보통 이번 대기실 마운트 시각) 이후에 '방 없음'이 확인됐는가.
export function hasServerConfirmedNoRoomSince(sinceMs: number) {
  return serverConfirmedNoRoomAtMs !== null && serverConfirmedNoRoomAtMs >= sinceMs;
}

export function resetServerConfirmedNoRoomForTest() {
  serverConfirmedNoRoomAtMs = null;
}
