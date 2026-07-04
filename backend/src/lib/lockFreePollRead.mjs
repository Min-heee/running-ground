// Lock-free poll reads — the fix for the store-lock convoy the arm-delivery trace exposed
// (2026-07-04: /rooms/my durMs spikes of 1.2-3.5s in production).
//
// High-frequency polls (rooms/my, matches/status, invite-inbox) used to run under
// mutateStore — on the postgres driver that is `SELECT ... FOR UPDATE` on the single
// whole-store row, so EVERY request serialized behind every other and one slow request
// convoyed all of them. That convoy had two user-facing costs during a match start:
//  1. host-start DELIVERY lag — the guest's 2s lobby polls each waited seconds, so it
//     learned the linked match 12-14s after press (joined the countdown mid-digit), and
//  2. CLOCK skew — the clients' RTT-based server-clock sync attributes half of any
//     response delay to travel time, so a 3s lock wait bakes ~1.5s of offset error into
//     whichever phone caught the spike (the run-to-run 0-2s digit gap).
//
// Mechanism: probe the poll's compute against a lock-free loadStore() clone first.
//  - UNCHANGED store (the overwhelmingly common poll case): serve the clone result —
//    no lock taken, requests run fully concurrently.
//  - CHANGED store (sync transition, sweep, matchmaking pairing): DISCARD the clone
//    result and re-run once under mutateStore, serving THAT result — so the response is
//    always consistent with the PERSISTED state (generated session ids, pairings) and
//    the locked execution is byte-for-byte the same single run these routes did before.
//    The clone pass is a pure probe; its mutations are thrown away with the clone.
//
// Correctness notes:
//  - compute throwing on the clone (401 etc.) propagates unchanged.
//  - compute must not have out-of-store side effects beyond idempotent bookkeeping —
//    on a transition it runs twice (probe + locked), same as a client retry would.
//  - a concurrent writer between probe and lock is fine: the locked re-run sees the
//    fresh row, exactly like today's serialized execution.

export async function runLockFreePollRead({ loadStore, mutateStore, compute }) {
  const store = await loadStore();
  const beforeSerialized = JSON.stringify(store);
  const probeResult = compute(store);

  if (JSON.stringify(store) === beforeSerialized) {
    return probeResult;
  }

  return mutateStore(compute);
}
