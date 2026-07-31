// 라이브 러닝 공개/응원 설정의 모듈 싱글턴 (오너 2026-07-31).
//
// 설정 화면(마이탭)과 러닝 하트비트가 서로 다른 트리에 살아서 React 상태로 잇기엔 프롭
// 체인이 너무 길다(runTrackingFlow 입력 타입 전체에 파문이 퍼진다). 설정은 부팅/저장
// 시점에 여기로 밀어 넣고, 하트비트는 보낼 때 읽기만 한다.
//
// 기본값은 둘 다 켬 — 서버 기본값(createDefaultNotificationSettings)과 같아야 설정을
// 한 번도 안 연 유저의 동작이 서버·클라에서 일치한다.

type LiveRunSettings = {
  liveRunPublic?: boolean;
  cheerAlerts?: boolean;
};

let liveRunPublic = true;
let cheerAlerts = true;

export function applyLiveRunSettings(settings: LiveRunSettings | null | undefined) {
  if (!settings) {
    return;
  }

  liveRunPublic = settings.liveRunPublic !== false;
  cheerAlerts = settings.cheerAlerts !== false;
}

export function isLiveRunPublic() {
  return liveRunPublic;
}

export function areCheerAlertsEnabled() {
  return cheerAlerts;
}

export function resetLiveRunSettingsForTest() {
  liveRunPublic = true;
  cheerAlerts = true;
}
