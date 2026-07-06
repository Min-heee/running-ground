import { armBlockingMatchStatusPollRetry } from '@/features/runs/sync/matchPolling/useBlockingMatchStatusPolling';
import type { RgRegistryDetail } from '@/utils/rgKeyedRegistry';
import { rgPerfMark } from '@/utils/rgPerfTrace';
import { startRgPollingInterval } from '@/utils/rgPollingRegistry';

// Lobby-room poll latch fix (docs/lobby-room-poll-latch-diag-2026-07-06.md, Piece 1a) — the
// guest lobby's /rooms/my snapshot poller carried the exact never-retried keyed-slot latch that
// df02afc fixed for match-STATUS polls: on a lost acquire startRgPollingInterval returns a dead
// no-timer handle, and the effect deps are stable while the room sits in 'waiting', so the
// guest's single host-start channel stayed permanently dead (no 로딩중, no countdown, arena jump
// at slot). This seam arms df02afc's proven retry helper on the snapshot poller's key: it
// re-attempts the acquire every intervalMs, and the moment the zombie owner releases it keeps the
// real polling handle and fires ONE catch-up loadRoom (safe: loadRoom self-gates on the
// paused/focus refs and every apply passes the existing monotonic/tombstone/dedup guards in
// activeRoomResultHandler). Lives in this RN-free sibling module — not the hook file — because
// useRoomSnapshotPolling.ts transitively imports react-native via roomSnapshotPollingPolicy, so
// this seam is what the node tests exercise. Timer fns are injectable for those tests, passing
// straight through to armBlockingMatchStatusPollRetry.
export function armRoomSnapshotPollRetry({
  detail,
  intervalMs,
  onTick,
  pollingKey,
  roomId,
  clearIntervalFn,
  setIntervalFn,
}: {
  detail: RgRegistryDetail;
  intervalMs: number;
  onTick: () => unknown | Promise<unknown>;
  pollingKey: string;
  roomId: string | null;
  clearIntervalFn?: typeof clearInterval;
  setIntervalFn?: typeof setInterval;
}) {
  rgPerfMark('match-room snapshot polling lost acquire', {
    intervalMs,
    pollingKey,
    roomId,
    source: 'match-room snapshot',
  });

  return armBlockingMatchStatusPollRetry({
    intervalMs,
    onReacquired: (handle) => {
      rgPerfMark('match-room snapshot polling reacquired after retry', {
        ownerId: handle.ownerId,
        pollingKey,
        source: 'match-room snapshot',
      });
    },
    onTick,
    startPolling: () => startRgPollingInterval({
      intervalMs,
      key: pollingKey,
      label: 'match-room snapshot polling',
      onTick,
      detail,
    }),
    ...(clearIntervalFn ? { clearIntervalFn } : {}),
    ...(setIntervalFn ? { setIntervalFn } : {}),
  });
}
