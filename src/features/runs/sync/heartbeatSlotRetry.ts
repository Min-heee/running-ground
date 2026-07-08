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
// tick a no-op (no double-arm, no post-stop acquire).
// Timer fns and the clock (nowFn) are injectable for the node tests.
//
// STALE-OWNER STEAL (optional `steal`) — the retry alone can never win against a LIVE silent
// holder: a frozen ghost runtime instance whose match target collapsed via a non-render ref
// mutation holds the slot forever (its effect cleanup never runs — deps stable — so it never
// releases) while sending nothing (its target resolves null on every tick, silently). When
// `steal` is provided, a retry tick that fails the acquire may EVICT that owner and take the
// slot in the same tick, but only when ALL of these hold:
//   1. the retry has been armed for longer than stallMs (never steal on a fresh arm), AND
//   2. the module-wide push-activity stamp (getLastPushActivityAtMs — advanced on EVERY reach of
//      the HTTP layer from ANY instance, incl. background flush) is null or older than stallMs —
//      a fresh stamp means SOMEONE is pushing, so never steal, AND
//   3. isViableSender() is true — the stealer can actually send right now.
// SAFETY INVARIANT (load-bearing): ownership must NEVER migrate to a non-viable sender. The
// ghost is silent precisely because its own target resolves null; a viable visible instance
// resolves non-null. The ghost's OWN retry interval keeps ticking too (frozen trees still fire
// timers), so WITHOUT gate 3 the ghost could steal the slot from a healthy-but-momentarily-quiet
// owner (e.g. right at iOS resume, before the owner's first keep-alive advances the stamp) — and
// since owners have NO retry loop (they took the success branch), that would be permanent
// silence: the exact bug this fixes. WITH the gate, a viable instance stealing from a viable
// owner is a harmless ownership swap (all instances send identical data from the shared module
// snapshot), and a ghost can never steal anything. A pusher whose HTTP hangs keeps the stamp
// fresh and is handled by the single-flight registry's 12s eviction instead (different registry,
// untouched here).

// Stall window before a failing re-acquirer may steal the slot from a silent owner. Must exceed
// the 2.5s heartbeat cadence × a few beats and the 3s background flush cadence by a wide margin
// so a merely-slow-to-stamp healthy pusher is never evicted; matches the single-flight registry's
// 12s stale-inflight horizon.
export const HEARTBEAT_SLOT_STEAL_STALL_MS = 12000;

type HeartbeatSlotAcquireHandle = {
  acquired: boolean;
  ownerId: number;
  release: () => void;
};

type HeartbeatSlotStealOptions = {
  stallMs: number;
  // Module-level push-activity ATTEMPT stamp (null until the app session's first push attempt).
  getLastPushActivityAtMs: () => number | null;
  // CRITICAL — the safety-invariant gate: may this instance actually send right now?
  isViableSender: () => boolean;
  // Force-free the slot regardless of owner (the registry's evict; old release stays a no-op).
  evict: () => void;
  onStolen?: (context: { evictedAfterMs: number }) => void;
};

export function armHeartbeatSlotAcquireRetry({
  intervalMs,
  acquireSlot,
  onReacquired,
  onCatchUp,
  steal,
  clearIntervalFn = clearInterval,
  setIntervalFn = setInterval,
  nowFn = Date.now,
}: {
  intervalMs: number;
  acquireSlot: () => HeartbeatSlotAcquireHandle;
  // Runs synchronously on the winning re-acquire, BEFORE the single catch-up send, so the caller
  // can install its owner bookkeeping (the heartbeat send gate reads it). Returns the teardown
  // that undoes exactly that bookkeeping; stop() runs it before releasing the slot.
  onReacquired: (slot: { ownerId: number }) => () => void;
  onCatchUp: () => unknown | Promise<unknown>;
  steal?: HeartbeatSlotStealOptions;
  clearIntervalFn?: typeof clearInterval;
  setIntervalFn?: typeof setInterval;
  nowFn?: () => number;
}) {
  let acquiredSlot: HeartbeatSlotAcquireHandle | null = null;
  let acquiredTeardown: (() => void) | null = null;
  let stopped = false;
  const armedAtMs = nowFn();
  const retryTimer = setIntervalFn(() => {
    if (stopped || acquiredSlot) {
      return;
    }

    let slot = acquireSlot();
    if (!slot.acquired) {
      if (!steal) {
        return;
      }

      // Steal gates, in order (see the header SAFETY INVARIANT): armed past the stall window,
      // push-activity stamp silent past the stall window (null = no push attempt this app
      // session yet — the armed-window gate alone covers that), and this instance viable.
      const now = nowFn();
      if (now - armedAtMs <= steal.stallMs) {
        return;
      }
      const lastPushActivityAtMs = steal.getLastPushActivityAtMs();
      if (lastPushActivityAtMs != null && now - lastPushActivityAtMs <= steal.stallMs) {
        return;
      }
      if (!steal.isViableSender()) {
        return;
      }

      steal.evict();
      steal.onStolen?.({ evictedAfterMs: now - armedAtMs });
      // Re-attempt the acquire IN THE SAME TICK so the freed slot goes to this viable stealer,
      // not to whichever other retry loop happens to tick next.
      slot = acquireSlot();
      if (!slot.acquired) {
        return;
      }
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
