import { useSyncExternalStore } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// TEMPORARY ON-SCREEN DIAGNOSTIC STORE — observe-only. Surfaces the real
// live-match runtime state + the events that open the arena / start measuring so
// the party-run GUEST "no countdown → straight to arena" skip can be SEEN on a
// physical device. This adds NO behavior; it only records values pushed to it.
// Revert before any real ship.
// ─────────────────────────────────────────────────────────────────────────────

export type LiveMatchDiagSnapshot = Record<string, string | number | boolean | null | undefined>;

export type LiveMatchDiagEvent = {
  tMs: number;
  label: string;
  detail: string;
};

export type LiveMatchDiagState = {
  snapshot: LiveMatchDiagSnapshot;
  events: LiveMatchDiagEvent[];
};

const MAX_EVENTS = 14;

const emptyState: LiveMatchDiagState = {
  snapshot: {},
  events: [],
};

let state: LiveMatchDiagState = emptyState;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // never let a bad listener break instrumentation
    }
  });
}

// Cheap shallow compare so a render that re-sets an identical snapshot does NOT
// churn subscribers (avoids a render loop in the overlay's useSyncExternalStore).
function shallowEqualSnapshot(a: LiveMatchDiagSnapshot, b: LiveMatchDiagSnapshot): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  for (const key of aKeys) {
    if (a[key] !== b[key]) {
      return false;
    }
  }
  return true;
}

export function setLiveMatchDiagSnapshot(snapshot: LiveMatchDiagSnapshot): void {
  try {
    if (shallowEqualSnapshot(state.snapshot, snapshot)) {
      return;
    }
    state = {
      snapshot,
      events: state.events,
    };
    emit();
  } catch {
    // no-throw
  }
}

function stringifyDetail(detail: unknown): string {
  if (detail == null) {
    return '';
  }
  if (typeof detail === 'string') {
    return detail;
  }
  try {
    if (typeof detail === 'object') {
      return Object.entries(detail as Record<string, unknown>)
        .map(([key, value]) => `${key}=${formatScalar(value)}`)
        .join(' ');
    }
    return String(detail);
  } catch {
    return '';
  }
}

function formatScalar(value: unknown): string {
  if (value == null) {
    return 'null';
  }
  if (typeof value === 'boolean') {
    return value ? 'y' : 'n';
  }
  return String(value);
}

export function pushLiveMatchDiagEvent(label: string, detail?: unknown): void {
  try {
    const detailStr = stringifyDetail(detail);
    const previous = state.events[0];
    // Dedupe trivially: skip if identical label+detail to the immediately-previous event.
    if (previous && previous.label === label && previous.detail === detailStr) {
      return;
    }
    const event: LiveMatchDiagEvent = {
      tMs: Date.now(),
      label,
      detail: detailStr,
    };
    const nextEvents = [event, ...state.events].slice(0, MAX_EVENTS);
    state = {
      snapshot: state.snapshot,
      events: nextEvents,
    };
    emit();
  } catch {
    // no-throw
  }
}

export function getLiveMatchDiagState(): LiveMatchDiagState {
  return state;
}

export function subscribeLiveMatchDiag(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

export function useLiveMatchDiag(): LiveMatchDiagState {
  return useSyncExternalStore(
    subscribeLiveMatchDiag,
    getLiveMatchDiagState,
    getLiveMatchDiagState,
  );
}
