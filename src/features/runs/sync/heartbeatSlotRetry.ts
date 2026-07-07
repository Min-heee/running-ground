// Heartbeat-slot latch fix — RN-free sibling of armBlockingMatchStatusPollRetry (the shipped
// opponent-poll stall organ), shaped for the heartbeat SLOT registry's acquire instead of the
// polling registry's start (acquire hands back `release()`, not a timer `stop()`, and the winner
// must install send-gate bookkeeping before any send may fire).
//
// acquireRgHeartbeatSlot returns a dead `{ acquired: false }` handle when the keyed slot is
// already owned, and the heartbeat-slot effect used to just return on that branch. Its deps
// (matchId + enabled) are value-stable for the whole match, so a lost acquire stayed permanently
// latched out of the send gate (canUseRgHeartbeatSlot(key, undefined) → false, every foreground
// heartbeat skipped as 'duplicate-heartbeat-owner') until the exact owning closure released.
// This helper arms a local retry interval that re-attempts the SAME acquire every intervalMs;
// the moment the slot frees up it keeps the winning handle, runs the caller's success-path
// bookkeeping (onReacquired — BEFORE the catch-up, so the send gate already sees the new owner),
// fires ONE immediate catch-up send (the latched instance delivered nothing while blocked), and
// stops retrying. stop() halts whichever is live: the retry timer, or the acquired slot (caller
// teardown first, then release — release is ownerId-guarded inside the registry, so a stale
// release can never evict a newer owner). The stopped/acquired guards make a straggler retry
// tick a no-op (no double-arm, no post-stop acquire). The registry modules stay untouched.
// Timer fns are injectable for the node tests.

type HeartbeatSlotAcquireHandle = {
  acquired: boolean;
  ownerId: number;
  release: () => void;
};

export function armHeartbeatSlotAcquireRetry({
  intervalMs,
  acquireSlot,
  onReacquired,
  onCatchUp,
  clearIntervalFn = clearInterval,
  setIntervalFn = setInterval,
}: {
  intervalMs: number;
  acquireSlot: () => HeartbeatSlotAcquireHandle;
  // Runs synchronously on the winning re-acquire, BEFORE the single catch-up send, so the caller
  // can install its owner bookkeeping (the heartbeat send gate reads it). Returns the teardown
  // that undoes exactly that bookkeeping; stop() runs it before releasing the slot.
  onReacquired: (slot: { ownerId: number }) => () => void;
  onCatchUp: () => unknown | Promise<unknown>;
  clearIntervalFn?: typeof clearInterval;
  setIntervalFn?: typeof setInterval;
}) {
  let acquiredSlot: HeartbeatSlotAcquireHandle | null = null;
  let acquiredTeardown: (() => void) | null = null;
  let stopped = false;
  const retryTimer = setIntervalFn(() => {
    if (stopped || acquiredSlot) {
      return;
    }

    const slot = acquireSlot();
    if (!slot.acquired) {
      return;
    }

    clearIntervalFn(retryTimer);
    acquiredSlot = slot;
    acquiredTeardown = onReacquired(slot);
    // One immediate catch-up send — same swallow-errors style as armBlockingMatchStatusPollRetry.
    void Promise.resolve(onCatchUp()).catch(() => {});
  }, intervalMs);

  return {
    stop: () => {
      if (stopped) {
        return;
      }
      stopped = true;
      clearIntervalFn(retryTimer);
      acquiredTeardown?.();
      acquiredTeardown = null;
      acquiredSlot?.release();
      acquiredSlot = null;
    },
  };
}
