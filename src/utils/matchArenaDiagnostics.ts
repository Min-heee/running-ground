type MatchArenaDiagnosticsInput = {
  instanceId: string;
  mode: string;
  showLiveArena: boolean;
  canRenderLiveArena: boolean;
  shouldKeepRunningMatchArena: boolean;
  isCurrentUserForfeited: boolean;
  isRunning: boolean;
  hasMatchResultPage: boolean;
  forceOpenActiveMatch: boolean;
  trackingStatus: string;
  matchMode: string;
  duelMatchState: string | null | undefined;
  duelArenaParticipantsLength: number;
  duelShouldOpenCountdownArena: boolean;
  duelShouldHoldArenaDuringActivation: boolean;
  hasRoomLinkedDuelContext: boolean;
  roomLinkedDuelPlaceholderParticipantsLength: number;
  roomShouldOpenCountdownArena: boolean;
  partyRunPhase: string;
  remainingSeconds: number | null | undefined;
  roomState: string | null | undefined;
  linkedMatchStatus: string | null | undefined;
  linkedMatchId: string | null | undefined;
};

export type MatchArenaDiagnosticsThrottleRef = {
  current: { lastKey: string | null; lastAt: number };
};

let lastLoggedKey: string | null = null;
let lastLoggedAt = 0;
const THROTTLE_MS = 1000;

export function createMatchArenaDiagnosticsThrottle(): MatchArenaDiagnosticsThrottleRef['current'] {
  return { lastKey: null, lastAt: 0 };
}

export function reportMatchArenaDiagnostics(
  input: MatchArenaDiagnosticsInput,
  throttle?: MatchArenaDiagnosticsThrottleRef['current'],
): void {
  const key = JSON.stringify(input);
  const now = Date.now();

  if (throttle) {
    if (key === throttle.lastKey && now - throttle.lastAt < THROTTLE_MS) {
      return;
    }

    throttle.lastKey = key;
    throttle.lastAt = now;
  } else {
    if (key === lastLoggedKey && now - lastLoggedAt < THROTTLE_MS) {
      return;
    }

    lastLoggedKey = key;
    lastLoggedAt = now;
  }

  // Intentionally uses warn so release logcat keeps this temporary diagnosis.
  console.warn('[arena-diag]', key);
}

export function resetMatchArenaDiagnosticsForTest(): void {
  lastLoggedKey = null;
  lastLoggedAt = 0;
}
