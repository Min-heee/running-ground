// 화면꺼짐 갭 정산 — 잠들었던 JS 원장에 네이티브가 센 거리를 돌려준다.
//
// iOS는 화면이 꺼지면 JS 스레드를 재운다. GPS는 계속 오지만 그걸 거리로 바꾸는 코드가 안
// 돌아서 거리만 얼어붙고, 네이티브 누적기(빌드 55/44+)가 옆에서 진짜 거리를 센다. 그 값은
// 업로드에만 실렸고 **저장되는 기록은 100% JS 원장**이라, 화면을 늦게 켠 러너의 기록은
// 잠든 구간만큼 영영 짧았다 (오너 실사고 2026-08-17: 회원F 파티런 — 같은 코스를 더 빨리
// 뛰고도 5km가 안 채워진 기록으로 끝남).
//
// 여기서 그 구간을 검증하고 돌려준다. 설계의 뼈대 두 가지:
//
// ① 증거는 깨어나는 순간 포획한다. 전면 복귀가 배터리를 위해 네이티브 누적기를 즉시 꺼서
//    (useTrackingAppStateSync) 총거리를 지우므로, 값은 끄기 **전에** 붙잡아야 한다.
//
// ② 크레딧은 "포획한 네이티브 − **정산하는 순간의** JS"다. 포획 시점의 JS가 아니라는 것이
//    핵심이다: OS가 밀린 픽스를 재생하든(수면 시각이 찍힌 픽스), 마지막 15초 꼬리만
//    배달하든, JS가 스스로 되찾은 거리는 정산 시점의 JS 총거리에 이미 들어 있다 — 빼는
//    쪽이 자동으로 맞춰지므로 재생을 **판별할 필요 자체가 없다**. JS가 하나도 못 되찾으면
//    (나이 필터가 15초보다 오래된 픽스를 버리므로 대부분 이 경우다) 차이가 그대로 남고,
//    전부 되찾으면 차이가 0으로 줄어 이중 적립이 불가능하다. 정산이 늦어질수록 깨어난 뒤
//    새로 뛴 거리만큼 과소해질 수 있어(안전한 방향), 첫 픽스 묶음에서 곧바로 정산한다.

import {
  isGapRuleBinarySupported,
  ENABLE_NATIVE_DISTANCE_MERGE,
  getMergeableNativeDistanceMeters,
} from '@/features/runs/tracking/background/distanceAccumulatorController';
import {
  MAX_CREDITABLE_FIX_GAP_MS,
  MAX_REASONABLE_RUNNING_SPEED_MPS,
} from '@/features/runs/tracking/background/locationDistance';
import {
  creditExternalDistanceMeters,
  getAccumulatedDistanceMeters,
  setPreWakeFixFloorMs,
} from '@/features/runs/tracking/background/routeAccumulator';
import { getBackgroundSyncDiagnostics } from '@/features/runs/tracking/background/backgroundSyncDiagnostics';
import { getSnapshotState } from '@/features/runs/tracking/background/snapshotStore';
import { rgDiagLog } from '@/utils/rgPerfTrace';

// OTA 킬스위치 — 현장 회귀 시 이것만 내리면 정산 전체가 무동작이 된다.
export const ENABLE_SCREEN_OFF_GAP_RECONCILE = true;

// 이보다 짧게 잠든 건 정산하지 않는다. 신호 끊김 문턱(30초)보다 **길어야 한다**: 그보다
// 짧은 공백은 라이브 필터가 깨어난 첫 픽스의 직선을 정상 주행으로 직접 적립하므로
// (isSignalLossGapMs 미만), 거기에 크레딧까지 주면 같은 구간이 두 번 적립된다. 30초를
// 넘는 공백만이 '적립되지 않은 직선'을 남기고, 그것이 정확히 크레딧이 메울 구멍이다.
export const MIN_STALE_GAP_MS = MAX_CREDITABLE_FIX_GAP_MS + 15_000;
// 이보다 작은 차이는 갭이 아니라 두 누적기의 필터 차이(지터)다. 냉시동 직후 화면을 끄면
// 네이티브가 워밍업 지터를 수십 m 더 세는 것으로 관측됐다(실기기 빌드 41: ~55m) — 그
// 크기의 차이를 갭으로 이관하면 안 된다.
export const MIN_CREDIT_METERS = 80;
// GPS 픽스가 이 시간 안에 안 오면(실내에서 멈춤·수신 불가) 포획본만으로 정산한다.
export const QUIET_WAKE_RECONCILE_DELAY_MS = 12_000;

type CapturedGap = {
  wakeAtMs: number;
  // 잠들어 있던 시간 — 크레딧 상한의 근거.
  staleGapMs: number;
  // 네이티브 누적기를 끄기 직전 포획한 총거리.
  nativeMetersAtWake: number;
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

// 실제 정산. 포획한 네이티브 총거리에서 **지금의** JS 총거리를 뺀 만큼만 이관한다 — JS가
// 스스로 되찾은 몫(재생·꼬리 배달)은 지금의 JS에 이미 들어 있으므로 자동으로 제외된다.
function settle({ via }: { via: string }) {
  const gap = captured;

  if (!gap) {
    return;
  }

  captured = null;
  clearQuietWakeTimer();

  // 정산 전에 런이 바뀌었으면(종료 후 새 런) 남의 런에 이관하면 안 된다. 일시정지는
  // 허용한다 — 깨어나서 곧바로 종료 버튼을 누르는 것이 바로 이 사고의 흐름이고, 그때
  // 스냅샷은 이미 'paused'다. startedAt이 같은 한 같은 런이다.
  const snapshot = getSnapshotState();
  const sameRun = snapshot.startedAt === gap.runStartedAt
    && (snapshot.status === 'running' || snapshot.status === 'paused');

  if (!sameRun) {
    rgDiagLog('[RG gap] SKIP run changed before settle');
    return;
  }

  const jsMetersNow = getAccumulatedDistanceMeters();
  const rawCreditMeters = gap.nativeMetersAtWake - jsMetersNow;
  // 상한: 잠든 시간 동안 사람이 달릴 수 있는 최대 거리 — 마지막 방어선.
  const capMeters = (gap.staleGapMs / 1000) * MAX_REASONABLE_RUNNING_SPEED_MPS;
  const creditMeters = Math.min(rawCreditMeters, capMeters);

  if (creditMeters < MIN_CREDIT_METERS) {
    rgDiagLog(`[RG gap] SKIP credit below floor (${creditMeters.toFixed(0)}m)`);
    return;
  }

  creditExternalDistanceMeters(creditMeters);
  // 이 순간부터 깨어난 시각 이전에 찍힌 픽스는 원장에 못 들어온다. 크레딧이 그 구간을 이미
  // 보상했으므로, 늦게 재생되는 수면 꼬리(나이 필터 15초를 통과하는)가 두 번째로 적립되는
  // 길을 막는다. 정산 전에 도착한 꼬리는 jsMetersNow에 들어 있어 위의 뺄셈이 이미 차감했다.
  setPreWakeFixFloorMs(gap.wakeAtMs);
  rgDiagLog(`[RG gap] SETTLE via=${via} +${creditMeters.toFixed(0)}m`);
}

// 깨어나는 순간 호출된다 — **네이티브 누적기를 끄기 전에**. 이미 대기 중인 포획이 있으면
// 먼저 정산한다: 잠금 화면 배너·Face ID처럼 'active'가 연달아 두 번 오는 상황에서 이전
// 포획을 버리면, 이미 꺼진 네이티브에서는 그 갭을 다시는 알 수 없다.
export function captureScreenOffGapOnWake({
  nowMs = Date.now(),
  quietWakeDelayMs = QUIET_WAKE_RECONCILE_DELAY_MS,
}: { nowMs?: number; quietWakeDelayMs?: number } = {}): boolean {
  settle({ via: 'pre-recapture' });

  if (!ENABLE_SCREEN_OFF_GAP_RECONCILE || !ENABLE_NATIVE_DISTANCE_MERGE) {
    return false;
  }

  // 갭 규칙 없는 바이너리의 네이티브 총거리는 블랙아웃 직선을 품고 있을 수 있다 — 믿지 않는다.
  // 이하의 모든 탈출은 이유를 남긴다 (2026-08-23 사고: 한 러너의 폰에서 왜 깨어남 크레딧이
  // 없었는지 진단 로그만으로는 알 수 없었다 — 침묵 탈출은 사후 부검을 불가능하게 만든다).
  // 유일한 예외는 '러닝 중이 아님' — 러닝 밖의 모든 화면 켜짐마다 찍히는 소음이라 뺀다.
  if (!isGapRuleBinarySupported()) {
    rgDiagLog('[RG gap] SKIP capture: no gap-rule binary');
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
    rgDiagLog('[RG gap] SKIP capture: no liveness clock yet');
    return false;
  }

  const staleGapMs = nowMs - lastAliveAtMs;

  if (staleGapMs < MIN_STALE_GAP_MS) {
    rgDiagLog(`[RG gap] SKIP capture: gap ${Math.round(staleGapMs / 1000)}s below floor`);
    return false;
  }

  const nativeMetersAtWake = getMergeableNativeDistanceMeters();

  // 네이티브가 없거나(솔로 런·구버전) 앞서지 않으면 정산할 게 없다. native=0 이 찍히면
  // 누적기가 아예 무장되지 못한 채 잠들었다는 뜻이다 — 민병희 사고의 시그니처.
  if (nativeMetersAtWake - getAccumulatedDistanceMeters() < MIN_CREDIT_METERS) {
    rgDiagLog(
      `[RG gap] SKIP capture: native not ahead (native=${nativeMetersAtWake.toFixed(0)}m js=${getAccumulatedDistanceMeters().toFixed(0)}m gap=${Math.round(staleGapMs / 1000)}s)`,
    );
    return false;
  }

  captured = {
    wakeAtMs: nowMs,
    staleGapMs,
    nativeMetersAtWake,
    runStartedAt: snapshot.startedAt,
  };
  rgDiagLog(
    `[RG gap] CAPTURE stale=${Math.round(staleGapMs / 1000)}s native=${nativeMetersAtWake.toFixed(0)}m js=${getAccumulatedDistanceMeters().toFixed(0)}m`,
  );

  // GPS 픽스가 영영 안 오는 깨어남(실내 종료)을 위한 안전망. JS가 그 사이 또 잠들어 타이머가
  // 늦게 울려도 안전하다 — 정산이 '지금의 JS'를 빼므로 언제 울리든 이중 적립이 없다.
  quietWakeTimer = setTimeout(() => {
    quietWakeTimer = null;
    settle({ via: 'quiet-wake' });
  }, quietWakeDelayMs);

  return true;
}

// ── 잠금 중 재개 포획 (2026-08-24 iOS 사고) ──────────────────────────────────────
// iOS는 화면이 잠긴 동안 JS를 재웠다 깨웠다 한다(실측 1.4~4.3분 블랙아웃 후 재개 — 한 러너
// 8/23 5회 2.19km 유실, 회원F 8/17, 회원G, 회원J 동일 시그니처). 화면은 계속 꺼져
// 있으므로 AppState 'active'가 오지 않아 깨어남 포획이 영영 안 돌고, 재개 ~12초 뒤 '신선'
// 판정과 함께 플러시/솔로 가드의 되심기가 네이티브 리드(유일한 증거)를 지운다. 그래서
// 위치 태스크가 픽스 묶음을 반영하기 **직전에**(원장이 아직 블랙아웃 이전 상태일 때)
// 여기를 불러 갭이 보이면 포획한다 — 반영 후의 기존 정산이 재생 몫을 자동 차감하며
// 적립한다(아래 reconcileScreenOffGapAfterFixesAppended). 정상 주행(갭 < 문턱)은 포획
// 함수에 들어가기 전에 조용히 빠져나가 픽스마다 SKIP 로그가 쌓이지 않는다.
export function maybeCaptureBlackoutEndGap({ nowMs = Date.now() }: { nowMs?: number } = {}): boolean {
  const diagnostics = getBackgroundSyncDiagnostics();
  const lastAliveAtMs = diagnostics.lastDistanceAdvanceAtMs ?? diagnostics.lastSnapshotAtMs;

  if (lastAliveAtMs === null || nowMs - lastAliveAtMs < MIN_STALE_GAP_MS) {
    return false;
  }

  return captureScreenOffGapOnWake({ nowMs });
}

// 위치 픽스가 JS 원장에 반영된 **직후** 호출된다(백그라운드 태스크·전면 워치 둘 다). 첫
// 묶음이 정산을 확정한다 — 방금 반영된 몫은 이미 JS 총거리에 들어 있어 자동으로 빠진다.
export function reconcileScreenOffGapAfterFixesAppended() {
  if (!captured) {
    return;
  }

  settle({ via: 'fixes' });
}

// 강제 정산 — 저장이 스냅샷을 읽기 직전에 부른다. 깨어나자마자 종료를 누르는 흐름에서
// 픽스도 타이머도 오기 전에 저장이 시작될 수 있다.
export function settlePendingScreenOffGapNow() {
  if (!captured) {
    return;
  }

  settle({ via: 'forced' });
}

export function resetScreenOffGapReconcileForTest() {
  captured = null;
  clearQuietWakeTimer();
}

// 테스트 전용 — 포획 상태 관찰.
export function getScreenOffGapCaptureForTest(): CapturedGap | null {
  return captured;
}
