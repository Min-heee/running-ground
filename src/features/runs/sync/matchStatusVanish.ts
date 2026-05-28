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
}: {
  hasMatchResultPage: boolean;
  vanishConfirmed: boolean;
}) {
  return vanishConfirmed && !hasMatchResultPage;
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
