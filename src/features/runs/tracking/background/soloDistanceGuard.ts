// 솔로 런 화면꺼짐 보호 — 매치 없이 혼자 뛸 때도 네이티브 거리 누적기를 켠다.
//
// 화면꺼짐 거리 손실의 수술(screenOffGapReconcile)은 처음부터 매치를 따지지 않았다:
// 깨어날 때 포획하고, 검증하고, JS 원장에 이관하는 전 과정이 매치와 무관하다. 그런데
// 그 재료인 **네이티브 거리 누적기를 켜는 곳이 매치 진행 플러시뿐**이라, 솔로 런은 잠들면
// 여전히 거리를 잃었다 — 같은 병, 같은 치료약인데 처방이 매치 환자에게만 나가던 셈이다.
//
// 여기서 그 처방을 솔로 런으로 넓힌다. 순수 JS 배선이라 OTA로 나가고, 갭 규칙 바이너리
// (iOS 55+/Android 44+)에서만 열린다 — 판별·정산·상한은 전부 기존 부품을 그대로 쓴다.
//
// 수명: 백그라운드 진입 때 켜고(전면에서는 JS 파이프라인이 유일한 진실이라 켤 이유가
// 없고 배터리만 쓴다), 깨어날 때/러닝 종료 때 끄는 것은 **기존 경로가 이미 무조건**
// 한다(useTrackingAppStateSync의 'active' 분기와 트래커 상태 정리 — 매치를 안 따진다).

import {
  ENABLE_NATIVE_DISTANCE_MERGE,
  isGapRuleBinarySupported,
  isNativeDistanceAccumulatorStartedFor,
  seedNativeDistanceAccumulatorToMeters,
  startNativeDistanceAccumulator,
} from '@/features/runs/tracking/background/distanceAccumulatorController';
import { getBackgroundMatchProgressContext } from '@/features/runs/tracking/background/backgroundMatchProgressSync';
import { getBackgroundSyncDiagnostics } from '@/features/runs/tracking/background/backgroundSyncDiagnostics';
import { getAccumulatedDistanceMeters } from '@/features/runs/tracking/background/routeAccumulator';
import { getSnapshotState } from '@/features/runs/tracking/background/snapshotStore';
import { isMyMatchDistanceStale } from '@/features/runs/sync/matchDistanceStaleness';

// OTA 킬스위치 — 현장 회귀 시 이것만 내리면 솔로 보호 전체가 무동작이 된다. 매치 경로는
// 이 스위치와 무관하게 오늘과 동일하다.
export const ENABLE_SOLO_SCREEN_OFF_GUARD = true;

// JS가 살아 있는 동안의 재파종 간격. 매치 경로는 백그라운드 플러시마다 네이티브를 JS
// 총거리로 되심어 누적기의 지터 초과분을 지우는데, 솔로에는 플러시가 없으므로 위치 픽스
// 처리 직후(= JS가 살아 있다는 증거)에 같은 일을 한다. 픽스마다 하면 네이티브 호출이
// 초당 하나라 낭비고, 이 간격이면 얼어붙기 직전의 기준선이 최대 이만큼만 낡는다.
export const SOLO_RESEED_INTERVAL_MS = 5_000;

let lastReseedAtMs = 0;

// JS 원장이 '지금도 실제로 재고 있는가'. 얼어붙은 원장은 기준선 자격이 없다 — 그걸로
// 네이티브를 되심으면 잠든 구간을 정산 전에 지워버린다(적대 검증이 잡음: iOS는 깨어남
// 직후 밀린 픽스 묶음이 AppState 'active'보다 먼저 도착해 전부 나이 필터에 떨어진 채
// 재파종만 통과하는 경합, 안드로이드는 JS가 살아 있는데 픽스가 전부 거절돼 거리만 어는
// 2026-08-09 갤럭시 모드 — 매치 플러시의 재파종이 신선도 게이트를 단 이유와 정확히 같다).
function jsLedgerIsFresh(nowMs: number): boolean {
  const diagnostics = getBackgroundSyncDiagnostics();
  return !isMyMatchDistanceStale({
    lastUpdatedAtMs: diagnostics.lastDistanceAdvanceAtMs ?? diagnostics.lastSnapshotAtMs,
    nowMs,
  });
}

function soloGuardEligible(): boolean {
  if (!ENABLE_SOLO_SCREEN_OFF_GUARD || !ENABLE_NATIVE_DISTANCE_MERGE) {
    return false;
  }

  // 갭 규칙 없는 바이너리의 누적기는 블랙아웃 직선을 적립한다 — 켜지 않는다(fail-closed).
  if (!isGapRuleBinarySupported()) {
    return false;
  }

  // 매치가 진행 중이면 매치 플러시가 누적기의 주인이다 — 키가 엇갈리며 서로 재시동하는
  // 소음을 만들지 않는다.
  if (getBackgroundMatchProgressContext() !== null) {
    return false;
  }

  const snapshot = getSnapshotState();
  return snapshot.status === 'running' && snapshot.startedAt !== null;
}

// 백그라운드 진입(화면 꺼짐·앱 전환) 순간 호출된다. 솔로 런이면 네이티브 누적기를 켜고
// JS 총거리를 심는다. 같은 런에서 두 번째 백그라운드 진입이면 — 깨어날 때 껐으므로 —
// 새로 켜지고 다시 심어진다(startNativeDistanceAccumulator의 키 dedupe가 알아서 한다).
export async function armSoloDistanceAccumulatorOnBackground({ nowMs = Date.now() }: { nowMs?: number } = {}): Promise<boolean> {
  if (!soloGuardEligible()) {
    return false;
  }

  const snapshot = getSnapshotState();
  const soloKey = `solo:${snapshot.startedAt}`;

  // 동결 게이트는 **이미 도는 누적기**에만 건다. 새로 켜는 건 언제나 안전하다 — 아직 센 게
  // 없어 지울 것도 없고, 동결(신호등 정지·GPS 워밍업)이어도 그 순간의 JS 총거리는 정확한
  // 기준선이다. 재검증이 잡은 함정이 바로 이것이었다: 신선도를 무장 전체에 걸면 횡단보도에
  // 20초 서 있다 잠근 러너의 세션 전체가 무보호가 된다 — 고치려던 손실의 부활. 반대로
  // 같은 키로 이미 도는 누적기의 재시동은 재파종을 겸하므로, 동결 원장일 때는 그 되심기가
  // 잠든 구간을 지운다 — 그 경우만 막는다.
  if (isNativeDistanceAccumulatorStartedFor(soloKey) && !jsLedgerIsFresh(nowMs)) {
    return false;
  }

  return startNativeDistanceAccumulator(soloKey, getAccumulatedDistanceMeters());
}

// 위치 픽스가 JS 원장에 반영된 직후(백그라운드 태스크) 호출된다. JS가 살아서 직접 세는
// 동안에는 네이티브를 JS 총거리로 주기적으로 되심는다 — 그래야 나중에 JS가 얼었을 때의
// 크레딧(네이티브 − JS)이 잠든 구간만 담고, 누적기의 지터 초과분을 함께 이관하지 않는다.
export function reseedSoloDistanceAccumulatorAfterFixes({ nowMs = Date.now() }: { nowMs?: number } = {}) {
  // 전면에서는 깨어날 때 누적기가 이미 꺼졌다 — 심을 곳이 없다.
  if (!getBackgroundSyncDiagnostics().isAppBackground) {
    return;
  }

  if (!soloGuardEligible()) {
    return;
  }

  // 재무장 — 백그라운드 진입 때의 시동이 실패했거나(일시 오류) 아직 안 켜졌으면 여기서
  // 켠다. 매치 경로가 플러시마다 시동을 재시도하는 것의 솔로판이다. 새 시동은 동결
  // 여부와 무관하게 안전하다(위 무장 함수의 근거와 동일).
  const soloKey = `solo:${getSnapshotState().startedAt}`;
  if (!isNativeDistanceAccumulatorStartedFor(soloKey)) {
    void startNativeDistanceAccumulator(soloKey, getAccumulatedDistanceMeters()).catch(() => undefined);
    return;
  }

  if (nowMs - lastReseedAtMs < SOLO_RESEED_INTERVAL_MS) {
    return;
  }

  // 신선할 때만 — 거리가 실제로 늘고 있는 원장만이 기준선 자격이 있다. 동결 원장으로
  // 도는 누적기를 되심으면 잠든 구간을 정산 전에 지운다(iOS 깨어남 경합·갤럭시
  // 살아있는-동결 모드 — 매치 플러시의 재파종이 같은 게이트를 단 이유).
  if (!jsLedgerIsFresh(nowMs)) {
    return;
  }

  lastReseedAtMs = nowMs;
  seedNativeDistanceAccumulatorToMeters(getAccumulatedDistanceMeters());
}

export function resetSoloDistanceGuardForTest() {
  lastReseedAtMs = 0;
}
