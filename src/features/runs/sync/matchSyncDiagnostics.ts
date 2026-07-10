import { useSyncExternalStore } from 'react';

// ON-DEVICE SYNC DIAGNOSTICS (2026-07-10) — the two send-lifeline attempts failed on-device and
// the failure point cannot be discriminated from recordings alone. This module-level store is
// written (fire-and-forget one-liners) from the live-match send path and read by
// MatchSyncDiagnosticsPanel, which renders the raw truth on screen during a match:
//   - is the heartbeat armed, for which matchId, and does it own the slot?
//   - is the send lifeline ticking, and WHY did its last tick skip (the killer question)?
//   - are progress POSTs actually leaving the phone, and does the server ACK them?
// Temporary instrumentation: remove once the party-duel opponent-sync freeze is closed.

export type MatchSyncDiagnosticsState = {
  hbEnabled: boolean;
  hbMatchId: string | null;
  myHeartbeatOwnerId: number | null;
  lastCanSend: boolean | null;
  lastCanSendAtMs: number | null;
  pushAttempts: number;
  pushOks: number;
  pushErrs: number;
  lastPushOkAtMs: number | null;
  lastPushErrAtMs: number | null;
  lastPushErr: string | null;
  lifelineTicks: number;
  lifelineFires: number;
  lastLifelineFireAtMs: number | null;
  lastLifelineSkip: string | null;
  lastLifelineSkipAtMs: number | null;
};

let state: MatchSyncDiagnosticsState = {
  hbEnabled: false,
  hbMatchId: null,
  myHeartbeatOwnerId: null,
  lastCanSend: null,
  lastCanSendAtMs: null,
  pushAttempts: 0,
  pushOks: 0,
  pushErrs: 0,
  lastPushOkAtMs: null,
  lastPushErrAtMs: null,
  lastPushErr: null,
  lifelineTicks: 0,
  lifelineFires: 0,
  lastLifelineFireAtMs: null,
  lastLifelineSkip: null,
  lastLifelineSkipAtMs: null,
};

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function recordMatchSyncHeartbeatArmState(hbEnabled: boolean, hbMatchId: string | null) {
  if (state.hbEnabled === hbEnabled && state.hbMatchId === hbMatchId) {
    return;
  }
  state = { ...state, hbEnabled, hbMatchId };
  emit();
}

export function recordMatchSyncHeartbeatOwner(ownerId: number | null) {
  if (state.myHeartbeatOwnerId === ownerId) {
    return;
  }
  state = { ...state, myHeartbeatOwnerId: ownerId };
  emit();
}

export function recordMatchSyncCanSend(canSend: boolean, myOwnerId: number | null) {
  state = {
    ...state,
    lastCanSend: canSend,
    lastCanSendAtMs: Date.now(),
    myHeartbeatOwnerId: myOwnerId,
  };
  emit();
}

export function recordMatchSyncPushAttempt() {
  state = { ...state, pushAttempts: state.pushAttempts + 1 };
  emit();
}

export function recordMatchSyncPushOk() {
  state = { ...state, pushOks: state.pushOks + 1, lastPushOkAtMs: Date.now() };
  emit();
}

export function recordMatchSyncPushErr(message: string) {
  state = {
    ...state,
    pushErrs: state.pushErrs + 1,
    lastPushErrAtMs: Date.now(),
    lastPushErr: message.slice(0, 60),
  };
  emit();
}

export function recordMatchSyncLifelineTick(outcome: 'fired' | string) {
  if (outcome === 'fired') {
    state = {
      ...state,
      lifelineTicks: state.lifelineTicks + 1,
      lifelineFires: state.lifelineFires + 1,
      lastLifelineFireAtMs: Date.now(),
    };
  } else {
    state = {
      ...state,
      lifelineTicks: state.lifelineTicks + 1,
      lastLifelineSkip: outcome,
      lastLifelineSkipAtMs: Date.now(),
    };
  }
  emit();
}

export function getMatchSyncDiagnostics() {
  return state;
}

function subscribeMatchSyncDiagnostics(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useMatchSyncDiagnostics() {
  return useSyncExternalStore(
    subscribeMatchSyncDiagnostics,
    getMatchSyncDiagnostics,
    getMatchSyncDiagnostics,
  );
}
