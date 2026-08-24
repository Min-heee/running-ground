import {
  ensureNativeDistanceAccumulatorModuleResolved,
  getMergeableNativeDistanceMeters,
  getPersistedNativeDistanceSessionMeters,
} from '@/features/runs/tracking/background/distanceAccumulatorController';
import { rgDiagLog } from '@/utils/rgPerfTrace';

// ── 재실행 정산 증거 (2026-08-24, vc51 짝) ────────────────────────────────────────
// 러닝 중 프로세스가 죽으면(One UI 살해) vc51의 STICKY 부활이 네이티브 누적기를 되살려
// 거리를 계속 세고, 부활조차 못 떴으면 디스크의 세션 기록(getPersistedDistanceSessionMeters)
// 이 마지막 총거리를 쥔다. 문제는 앱 재실행의 순서다: 트래킹 화면이 마운트되면 정리 effect
// 가 누적기를 stop(디스크 기록 소각)하고, 재무장 경로가 죽기 전 JS 값으로 재시딩해 증거를
// 덮어쓴다 — 화면꺼짐 갭 포획은 AppState 전이 전용이라 콜드 재실행에선 아예 안 돈다(2차
// 적대 검증의 major). 그래서 루트 레이아웃이 뜨자마자 여기서 증거를 **한 번 선포획**해두고,
// 복원(restoreBackgroundRunSnapshot)이 소비한다. 소비는 1회 — 같은 증거가 두 런에 적립될
// 수 없다. 상한·바닥 등 안전 규칙은 소비하는 쪽(backgroundRunPersistence)이 적용한다.

type RelaunchEvidence = {
  meters: number;
  capturedAtMs: number;
};

let evidence: RelaunchEvidence | null = null;
let capturePromise: Promise<void> | null = null;

// 앱 시작 직후(루트 레이아웃) 한 번 호출 — idempotent. 트래킹 화면의 stop/재무장보다 먼저
// 돌아야 의미가 있으므로 최대한 이른 지점에서 불러라. 같은 프로세스 부활이면 버스 총계가,
// 새 프로세스면 디스크 기록이 증거가 된다(둘 다 있으면 큰 쪽 — 버스는 부활 후에도 계속
// 자랐을 수 있다).
export function captureRelaunchNativeEvidence(): Promise<void> {
  if (capturePromise) {
    return capturePromise;
  }

  capturePromise = (async () => {
    try {
      await ensureNativeDistanceAccumulatorModuleResolved();
      const meters = Math.max(
        getMergeableNativeDistanceMeters(),
        getPersistedNativeDistanceSessionMeters(),
      );
      if (meters > 0) {
        evidence = { meters, capturedAtMs: Date.now() };
        rgDiagLog(`[RG gap] relaunch evidence captured ${meters.toFixed(0)}m`);
      }
    } catch {
      // 증거가 없을 뿐 — 복원은 예전 그대로 진행된다.
    }
  })();

  return capturePromise;
}

// 복원이 소비한다 — 한 번뿐. 증거가 없으면 0.
export function consumeRelaunchNativeEvidenceMeters(): number {
  const current = evidence;
  evidence = null;
  return current?.meters ?? 0;
}

// 순수 정산 계산 — 복원(backgroundRunPersistence)이 쓴다. 갭 포획(settle)과 같은 안전
// 규칙: 크레딧 = min(증거 − 복원된 원장, 잠든 시간 × 최대 달리기 속도), 바닥(80m) 미만이면
// 0. 증거가 원장보다 뒤(음수)면 당연히 0.
export function resolveRelaunchGapCreditMeters({
  evidenceMeters,
  restoredMeters,
  gapMs,
  maxSpeedMps,
  minCreditMeters,
}: {
  evidenceMeters: number;
  restoredMeters: number;
  gapMs: number;
  maxSpeedMps: number;
  minCreditMeters: number;
}): number {
  if (!Number.isFinite(evidenceMeters) || evidenceMeters <= 0) {
    return 0;
  }

  const safeGapMs = Number.isFinite(gapMs) && gapMs > 0 ? gapMs : 0;
  const rawCreditMeters = evidenceMeters - Math.max(0, restoredMeters);
  const creditMeters = Math.min(rawCreditMeters, (safeGapMs / 1000) * maxSpeedMps);
  return creditMeters >= minCreditMeters ? creditMeters : 0;
}

// Test seam.
export function resetRelaunchNativeEvidenceForTest() {
  evidence = null;
  capturePromise = null;
}
