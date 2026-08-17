// 화면꺼짐 갭 정산 — 잠들었던 JS 원장에 네이티브가 센 거리를 돌려준다.
//
// iOS는 화면이 꺼지면 JS 스레드를 재운다. GPS는 계속 오지만 그걸 거리로 바꾸는 코드가 안
// 돌아서 거리만 얼어붙고, 네이티브 누적기(빌드 55/44+)가 옆에서 진짜 거리를 센다. 그 값은
// 업로드에만 실렸고 **저장되는 기록은 100% JS 원장**이라, 화면을 늦게 켠 러너의 기록은
// 잠든 구간만큼 영영 짧았다 (오너 실사고 2026-08-17: 회원F 파티런 — 같은 코스를 더 빨리
// 뛰고도 5km가 안 채워진 기록으로 끝남).
//
// 여기서 그 구간을 딱 한 번, 검증하고 돌려준다. 어려운 점은 두 가지다:
//
// ① 증거가 깨어나는 순간 파괴된다. 앱이 전면으로 오면 배터리를 위해 네이티브 누적기를
//    즉시 꺼버리므로(useTrackingAppStateSync), 값은 **끄기 전에** 포획해야 한다. 그래서
//    이 모듈의 입구는 '깨어남'이고, 포획본(스냅샷)으로만 일한다.
//
// ② OS가 밀린 GPS를 나중에 JS로 재생(replay)할 수 있다. 재생이 오면 JS가 스스로 갭을
//    따라잡으므로 크레딧까지 주면 **이중 적립**이다. 재생 여부는 깨어난 뒤 첫 GPS 묶음의
//    타임스탬프가 말해준다 — 잠든 구간의 시각이 찍힌 픽스가 하나라도 섞여 있으면 재생이다.
//    그 판별이 끝날 때까지 크레딧을 미루고, 묶음이 영영 안 오면(실내 종료) 타이머로 정산한다.

import {
  isGapRuleBinarySupported,
  ENABLE_NATIVE_DISTANCE_MERGE,
  getMergeableNativeDistanceMeters,
} from '@/features/runs/tracking/background/distanceAccumulatorController';
import { MAX_REASONABLE_RUNNING_SPEED_MPS } from '@/features/runs/tracking/background/locationDistance';
import {
  creditExternalDistanceMeters,
  getAccumulatedDistanceMeters,
} from '@/features/runs/tracking/background/routeAccumulator';
import { getBackgroundSyncDiagnostics } from '@/features/runs/tracking/background/backgroundSyncDiagnostics';
import { getSnapshotState } from '@/features/runs/tracking/background/snapshotStore';
import { rgDiagLog } from '@/utils/rgPerfTrace';

// OTA 킬스위치 — 현장 회귀 시 이것만 내리면 정산 전체가 무동작이 된다.
export const ENABLE_SCREEN_OFF_GAP_RECONCILE = true;

// 이보다 짧게 잠든 건 정산하지 않는다 — 앱 전환 몇 초에 갭이랄 게 없다.
export const MIN_STALE_GAP_MS = 15_000;
// 이보다 작은 차이는 갭이 아니라 두 누적기의 필터 차이(지터)다. 냉시동 직후 화면을 끄면
// 네이티브가 워밍업 지터를 수십 m 더 세는 것으로 관측됐다(실기기 빌드 41: ~55m) — 그
// 크기의 차이를 갭으로 이관하면 안 된다.
export const MIN_CREDIT_METERS = 80;
// 재생 판별 허용 오차 — 깨어나기 이 이상 전의 시각이 찍힌 픽스는 잠든 구간의 재생이다.
export const REPLAY_DETECT_TOLERANCE_MS = 15_000;
// GPS 묶음이 이 시간 안에 안 오면(실내에서 멈춤·수신 불가) 재생은 오지 않는 것으로 보고
// 포획본만으로 정산한다. 재생은 깨어난 직후에 오지, 이렇게 늦게 오지 않는다.
export const QUIET_WAKE_RECONCILE_DELAY_MS = 12_000;

type CapturedGap = {
  // 깨어난 시각 — 재생 판별의 기준선.
  wakeAtMs: number;
  // 잠들어 있던 시간 — 크레딧 상한의 근거.
  staleGapMs: number;
  // 끄기 직전 포획한 네이티브 총거리와 그 순간의 JS 총거리. 차이가 곧 잠든 구간이다.
  nativeMetersAtWake: number;
  jsMetersAtWake: number;
  // 같은 런인지 확인하는 열쇠 — 정산 전에 런이 끝나고 새 런이 시작되면 버린다.
  runStartedAt: string | null;
};

let captured: CapturedGap | null = null;
let quietWakeTimer: ReturnType<typeof setTimeout> | null = null;

function clearQuietWakeTimer() {
  if (quietWakeTimer !== null) {
    clearTimeout(quietWakeTimer);
    quietWakeTimer = null;
  }
}

function discard(reason: string) {
  if (captured) {
    rgDiagLog(`[RG gap] DISCARD ${reason}`);
  }
  captured = null;
  clearQuietWakeTimer();
}

// 깨어나는 순간 호출된다 — **네이티브 누적기를 끄기 전에**. 조건이 안 되면 아무것도 남기지
// 않고, 되면 포획본을 만들어 정산을 예약한다.
export function captureScreenOffGapOnWake({
  nowMs = Date.now(),
  quietWakeDelayMs = QUIET_WAKE_RECONCILE_DELAY_MS,
}: { nowMs?: number; quietWakeDelayMs?: number } = {}): boolean {
  discard('re-wake');

  if (!ENABLE_SCREEN_OFF_GAP_RECONCILE || !ENABLE_NATIVE_DISTANCE_MERGE) {
    return false;
  }

  // 갭 규칙 없는 바이너리의 네이티브 총거리는 블랙아웃 직선을 품고 있을 수 있다 — 믿지 않는다.
  if (!isGapRuleBinarySupported()) {
    return false;
  }

  const snapshot = getSnapshotState();

  if (snapshot.status !== 'running') {
    return false;
  }

  // 잠들어 있던 시간: 거리가 마지막으로 실제로 늘어난 뒤 지난 시간. 신선도 시계가 아직
  // 안 무장됐으면 스냅샷 시계로 대신한다.
  const diagnostics = getBackgroundSyncDiagnostics();
  const lastAliveAtMs = diagnostics.lastDistanceAdvanceAtMs ?? diagnostics.lastSnapshotAtMs;

  if (lastAliveAtMs === null) {
    return false;
  }

  const staleGapMs = nowMs - lastAliveAtMs;

  if (staleGapMs < MIN_STALE_GAP_MS) {
    return false;
  }

  const nativeMetersAtWake = getMergeableNativeDistanceMeters();
  const jsMetersAtWake = getAccumulatedDistanceMeters();

  // 네이티브가 없거나(솔로 런) 앞서지 않으면 정산할 게 없다.
  if (nativeMetersAtWake - jsMetersAtWake < MIN_CREDIT_METERS) {
    return false;
  }

  captured = {
    wakeAtMs: nowMs,
    staleGapMs,
    nativeMetersAtWake,
    jsMetersAtWake,
    runStartedAt: snapshot.startedAt,
  };
  rgDiagLog(
    `[RG gap] CAPTURE stale=${Math.round(staleGapMs / 1000)}s native=${nativeMetersAtWake.toFixed(0)}m js=${jsMetersAtWake.toFixed(0)}m`,
  );

  // GPS 묶음이 영영 안 오는 깨어남(실내 종료)을 위한 안전망.
  quietWakeTimer = setTimeout(() => {
    quietWakeTimer = null;
    settle({ replayObserved: false, nowMs: Date.now(), via: 'quiet-wake' });
  }, quietWakeDelayMs);

  return true;
}

// 실제 정산. 재생이 관측됐으면 JS가 스스로 따라잡으므로 버리고, 아니면 포획본의 차이를
// 상한 안에서 JS 원장에 이관한다.
function settle({ replayObserved, nowMs, via }: { replayObserved: boolean; nowMs: number; via: string }) {
  const gap = captured;

  if (!gap) {
    return;
  }

  captured = null;
  clearQuietWakeTimer();

  if (replayObserved) {
    rgDiagLog('[RG gap] SKIP replay observed — JS is catching up on its own');
    return;
  }

  // 정산 전에 런이 바뀌었으면(종료 후 새 런) 남의 런에 이관하면 안 된다.
  const snapshot = getSnapshotState();
  if (snapshot.status !== 'running' || snapshot.startedAt !== gap.runStartedAt) {
    rgDiagLog('[RG gap] SKIP run changed before settle');
    return;
  }

  const rawCreditMeters = gap.nativeMetersAtWake - gap.jsMetersAtWake;
  // 상한: 잠든 시간 동안 사람이 달릴 수 있는 최대 거리. 갭 규칙 바이너리만 여기 오지만,
  // 상한은 남는 방어가 아니라 마지막 방어다.
  const capMeters = (gap.staleGapMs / 1000) * MAX_REASONABLE_RUNNING_SPEED_MPS;
  const creditMeters = Math.min(rawCreditMeters, capMeters);

  if (creditMeters < MIN_CREDIT_METERS) {
    rgDiagLog(`[RG gap] SKIP credit below floor (${creditMeters.toFixed(0)}m)`);
    return;
  }

  creditExternalDistanceMeters(creditMeters);
  rgDiagLog(`[RG gap] SETTLE via=${via} +${creditMeters.toFixed(0)}m at=${nowMs}`);
}

// 깨어난 뒤 도착한 GPS 묶음마다 호출된다(위치 태스크). 첫 묶음이 재생 여부를 판별해 정산을
// 확정한다 — 묶음 안에 잠든 구간의 시각이 찍힌 픽스가 하나라도 있으면 재생이다.
export function reconcileScreenOffGapFromBatch(
  timestampsMs: number[],
  { nowMs = Date.now() }: { nowMs?: number } = {},
) {
  const gap = captured;

  if (!gap) {
    return;
  }

  if (timestampsMs.length === 0) {
    return;
  }

  const oldestMs = Math.min(...timestampsMs);
  const replayObserved = oldestMs < gap.wakeAtMs - REPLAY_DETECT_TOLERANCE_MS;
  settle({ replayObserved, nowMs, via: 'batch' });
}

// 런이 끝나면 포획본도 함께 버린다 — 다음 런의 첫 픽스에 낡은 갭을 이관하는 사고 방지.
export function discardScreenOffGapCapture() {
  discard('external');
}

export function resetScreenOffGapReconcileForTest() {
  captured = null;
  clearQuietWakeTimer();
}

// 테스트 전용 — 포획 상태 관찰.
export function getScreenOffGapCaptureForTest(): CapturedGap | null {
  return captured;
}
