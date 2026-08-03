import type { MatchLifecycleController } from '@/features/runs/lifecycle/matchLifecycleController';

export function shouldRunSlotElapsedTicker({
  activeMatchSlotStartAt,
  enabled = true,
}: {
  activeMatchSlotStartAt: string | null;
  enabled?: boolean;
}) {
  return enabled && Boolean(activeMatchSlotStartAt);
}

export function resolveSlotElapsedTickerDelayMs({
  slotStartMs,
  syncedNowMs,
}: {
  slotStartMs: number;
  syncedNowMs: number;
}) {
  const slotElapsedMs = syncedNowMs - slotStartMs;
  const elapsedMsIntoSecond = ((slotElapsedMs % 1000) + 1000) % 1000;
  const msUntilNextSecond = 1000 - elapsedMsIntoSecond;
  return Math.max(50, Math.min(1000, msUntilNextSecond));
}

export function resolveActiveMatchSlotStartAt(
  matchLifecycleController?: MatchLifecycleController,
) {
  if (!matchLifecycleController || matchLifecycleController.stage !== 'active') {
    return null;
  }

  return matchLifecycleController.gps.activeMatch?.slotStartAt ?? null;
}

// 표시 시간 티커 판정 (오너 2026-08-03: 시간이 GPS 프레임에만 실려 '멈췄다 점프'로 보임).
// 슬롯 티커(매치)가 없는 러닝은 1초마다 스냅샷의 표시 elapsed를 다시 읽어 앞으로만 민다.
// 슬롯 티커가 시간을 소유 중이거나, 측정 중이 아니거나(일시정지·미시작), 값이 뒤로
// 가거나 그대로면 null(커밋 없음).
export function resolveDisplayElapsedTick({
  slotTickerActive,
  snapshotStatus,
  nextElapsedSeconds,
  currentElapsedSeconds,
}: {
  slotTickerActive: boolean;
  snapshotStatus: string;
  nextElapsedSeconds: number;
  currentElapsedSeconds: number;
}): number | null {
  if (slotTickerActive || snapshotStatus !== 'running') {
    return null;
  }

  if (!Number.isFinite(nextElapsedSeconds) || nextElapsedSeconds <= currentElapsedSeconds) {
    return null;
  }

  return nextElapsedSeconds;
}
