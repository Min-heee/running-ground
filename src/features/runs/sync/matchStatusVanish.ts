import { isApiError } from '@/services/apiError';
import type { RunningMatchStatusResponse } from '@/lib/api/types';

export const MATCH_STATUS_VANISH_CONFIRMATION_COUNT = 2;

export type MatchStatusVanishState = {
  count: number;
  matchId: string | null;
};

type ApiErrorDetails = {
  code?: unknown;
  expectedMatchId?: unknown;
  invalidReason?: unknown;
};

function getApiErrorDetails(error: unknown): ApiErrorDetails | null {
  if (!isApiError(error) || typeof error.details !== 'object' || error.details === null) {
    return null;
  }

  return error.details as ApiErrorDetails;
}

export function isMatchStatusVanishError(error: unknown, expectedMatchId: string | null | undefined) {
  if (!expectedMatchId) {
    return false;
  }

  const details = getApiErrorDetails(error);
  if (!details || details.code !== 'invalid_match_status_response') {
    return false;
  }

  return (
    details.expectedMatchId === expectedMatchId
    && (
      details.invalidReason === 'missingMatchId'
      || details.invalidReason === 'mismatchedMatchId'
    )
  );
}

export function advanceMatchStatusVanishState(
  currentState: MatchStatusVanishState,
  matchId: string,
): MatchStatusVanishState {
  if (currentState.matchId !== matchId) {
    return { matchId, count: 1 };
  }

  return {
    matchId,
    count: currentState.count + 1,
  };
}

export function resetMatchStatusVanishState(
  currentState: MatchStatusVanishState,
  matchId?: string | null,
): MatchStatusVanishState {
  if (matchId && currentState.matchId && currentState.matchId !== matchId) {
    return currentState;
  }

  return {
    count: 0,
    matchId: null,
  };
}

export function isMatchStatusVanishConfirmed(state: MatchStatusVanishState) {
  return state.count >= MATCH_STATUS_VANISH_CONFIRMATION_COUNT;
}

export function shouldTeardownVanishedLinkedMatch({
  hasMatchResultPage,
  vanishConfirmed,
  isActivelyRecordingMatch = false,
}: {
  hasMatchResultPage: boolean;
  vanishConfirmed: boolean;
  // FIX-B (2026-07-09 field incident) — a confirmed vanish must NEVER demote a run that is
  // still actively recording this match (tracker status 'running', or a localGoalFreeze
  // exists for the matchId = crossed-but-unsaved). The 7/9 duel loss chain: the loser's own
  // un-acked finish made the session all-done → the next status poll pruned it → 200 'idle'
  // without matchId ×2 → vanish confirmed → clearVanishedLinkedMatch set matchMode 'solo'
  // MID-RUN, so the eventual save carried no matchId/matchResult (+0P, no 대결 card, no heal
  // path). Deferring the teardown keeps the match context alive so the save stays match-
  // sticky; the post-save cleanup tears everything down anyway.
  isActivelyRecordingMatch?: boolean;
}) {
  return vanishConfirmed && !hasMatchResultPage && !isActivelyRecordingMatch;
}

export function buildVanishedMatchStatusFallback({
  distanceKm,
  mode,
  slotStartAt,
}: {
  distanceKm: number;
  mode: 'duel' | 'group';
  slotStartAt: string;
}): RunningMatchStatusResponse {
  return {
    success: true,
    serverNow: new Date().toISOString(),
    mode,
    state: 'idle',
    distanceKm,
    slotStartAt,
    slotLabel: '정리됨',
    paceBandLabel: '정리됨',
    levelBandLabel: '정리됨',
    criteriaSummary: '매치가 정리됐어요.',
    estimatedWaitMinutes: 0,
    participantCount: 0,
    acceptedCount: 0,
    capacity: mode === 'duel' ? 2 : 30,
    userAccepted: false,
    readyToStart: false,
  };
}
