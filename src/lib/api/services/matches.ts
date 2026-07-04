import {
  apiGet,
  apiPost,
  isApiError,
  LIVE_MATCH_REQUEST_TIMEOUT_MS,
} from '../client';

import { USE_MOCK_API } from '../config';

import {
  AcceptRunningMatchInput,
  CancelRunningMatchInput,
  CancelRunningMatchResponse,
  FetchRunningMatchStatusInput,
  FetchMatchDemandSummaryInput,
  LeaveRunningMatchInput,
  LeaveRunningMatchResponse,
  MatchDemandSummaryResponse,
  MatchResultResponse,
  RequestDuelMatchInput,
  RequestDuelMatchResponse,
  RequestGroupMatchInput,
  RequestGroupMatchResponse,
  RunningMatchStatusResponse,
  UpdateRunningMatchProgressInput,
  UpdateRunningMatchProgressResponse,
  UpcomingRunningMatchesResponse,
} from '../types';

import {
  mockApiState,
  sanitizeUpcomingRunningMatchesResponse,
  formatMockMatchSlotDateLabel,
  getMockMatchCancelableUntilAt,
  buildMockDuelMatchResponse,
  buildMockGroupMatchResponse,
  buildMockMatchDemandSummary,
  buildMockMatchResultResponse,
  syncMockRunningMatchSession,
  hydrateMockRunningMatchSessionStatuses,
  buildMockWaitingMatchStatus,
  buildMockDuelMatchStatus,
  buildMockGroupMatchStatus,
  requireAccessToken,
} from './_shared';

import type {
  MockMatchLiveStatus,
} from './_shared';
import {
  ensureRunningMatchProgressResponse,
  ensureRunningMatchStatusResponse,
} from './runningMatchResponseGuards';

export async function requestDuelMatch(input: RequestDuelMatchInput): Promise<RequestDuelMatchResponse> {
  if (USE_MOCK_API) {
    const response = buildMockDuelMatchResponse(input);
    mockApiState.runningMatchSessions.duel = buildMockDuelMatchStatus(response);
    return response;
  }

  return apiPost<RequestDuelMatchResponse>(
    '/running/matches/duel',
    {
      distanceKm: Number(input.distanceKm.toFixed(1)),
      slotStartAt: input.slotStartAt,
      testMode: Boolean(input.testMode),
    },
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '1대1 매칭을 찾지 못했어.',
    },
  );
}

export async function requestGroupMatch(input: RequestGroupMatchInput): Promise<RequestGroupMatchResponse> {
  if (USE_MOCK_API) {
    const response = buildMockGroupMatchResponse(input);
    mockApiState.runningMatchSessions.group = buildMockGroupMatchStatus(response);
    return response;
  }

  return apiPost<RequestGroupMatchResponse>(
    '/running/matches/group',
    {
      distanceKm: Number(input.distanceKm.toFixed(1)),
      slotStartAt: input.slotStartAt,
      testMode: Boolean(input.testMode),
    },
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '그룹 매칭을 찾지 못했어.',
    },
  );
}

export async function fetchMatchDemandSummary(input: FetchMatchDemandSummaryInput): Promise<MatchDemandSummaryResponse> {
  if (USE_MOCK_API) {
    return buildMockMatchDemandSummary(input);
  }

  return apiPost<MatchDemandSummaryResponse>(
    '/running/matches/summary',
    {
      mode: input.mode,
      distanceKm: Number(input.distanceKm.toFixed(1)),
      slotStartAt: input.slotStartAt,
    },
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '현재 매칭 현황을 불러오지 못했어.',
    },
  );
}

export async function fetchRunningMatchStatus(input: FetchRunningMatchStatusInput): Promise<RunningMatchStatusResponse> {
  if (USE_MOCK_API) {
    const currentSession = syncMockRunningMatchSession(input.mode);

    if (
      currentSession
      && (!input.matchId || currentSession.matchId === input.matchId)
      && currentSession.distanceKm === Number(input.distanceKm.toFixed(1))
      && (
        (input.testMode && currentSession.isTestMatch)
        || (!input.testMode && currentSession.slotStartAt === input.slotStartAt)
      )
    ) {
      return ensureRunningMatchStatusResponse(
        {
          ...currentSession,
          serverNow: new Date().toISOString(),
        },
        {
          action: 'fetch-match-status',
          expectedMatchId: input.matchId,
          requireMatchId: Boolean(input.matchId),
        },
      );
    }

    return ensureRunningMatchStatusResponse(
      {
        ...buildMockWaitingMatchStatus(input),
        serverNow: new Date().toISOString(),
      },
      {
        action: 'fetch-match-status',
        expectedMatchId: input.matchId,
        requireMatchId: Boolean(input.matchId),
      },
    );
  }

  const payload = await apiPost<RunningMatchStatusResponse>(
    '/running/matches/status',
    {
      mode: input.mode,
      distanceKm: Number(input.distanceKm.toFixed(1)),
      slotStartAt: input.slotStartAt,
      testMode: Boolean(input.testMode),
      ...(input.matchId ? { matchId: input.matchId } : {}),
    },
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '매칭 상태를 불러오지 못했어.',
    },
  );

  return ensureRunningMatchStatusResponse(payload, {
    action: 'fetch-match-status',
    expectedMatchId: input.matchId,
    requireMatchId: Boolean(input.matchId),
  });
}

export async function fetchUpcomingRunningMatches(): Promise<UpcomingRunningMatchesResponse> {
  if (USE_MOCK_API) {
    const items = (['duel', 'group'] as const)
      .map((mode) => syncMockRunningMatchSession(mode))
      .filter((session): session is RunningMatchStatusResponse => {
        if (!session) {
          return false;
        }

        return ['matched', 'active'].includes(session.state);
      })
      .map((session) => ({
        matchId: session.matchId ?? `${session.mode}-${session.slotStartAt}`,
        mode: session.mode,
        ...(session.isTestMatch ? { isTestMatch: true } : {}),
        distanceKm: session.distanceKm,
        slotStartAt: session.slotStartAt,
        slotLabel: session.slotLabel,
        status: session.state === 'active' ? 'active' as const : 'matched' as const,
        participantCount: session.participantCount,
        counterpartLabel: session.mode === 'duel'
          ? session.opponent?.name ?? '상대 미정'
          : `${session.participantCount}명 그룹`,
        summary: `${formatMockMatchSlotDateLabel(session.slotStartAt)} ${session.slotLabel} · ${session.distanceKm.toFixed(1)}km`,
        canCancel: session.state === 'matched'
          && Date.now() < new Date(
            session.isTestMatch
              ? session.slotStartAt
              : getMockMatchCancelableUntilAt(session.slotStartAt) ?? session.slotStartAt,
          ).getTime(),
        cancelableUntilAt: session.isTestMatch
          ? session.slotStartAt
          : getMockMatchCancelableUntilAt(session.slotStartAt) ?? new Date(session.slotStartAt).toISOString(),
      }))
      .sort((left, right) => new Date(left.slotStartAt).getTime() - new Date(right.slotStartAt).getTime());

    // Sample duel-slot waiting counts so mock mode + tests exercise the slot-count UI:
    // one "person waiting" per slot+distance that currently has a duel match in flight.
    // Keyed by `${slotStartAt}|${normalizedDistanceKm}` to mirror the backend's
    // buildDuelSlotCountKey (and the client's matchScheduling.buildDuelSlotCountKey the
    // selector reads) — the format is inlined here to avoid a lib/api → features import
    // cycle (matchScheduling imports back into @/services).
    const duelSlotCounts = items.reduce<Record<string, number>>((counts, match) => {
      if (match.mode === 'duel') {
        const countKey = `${match.slotStartAt}|${Number(match.distanceKm.toFixed(1))}`;
        counts[countKey] = (counts[countKey] ?? 0) + 1;
      }
      return counts;
    }, {});

    return sanitizeUpcomingRunningMatchesResponse({
      serverNow: new Date().toISOString(),
      items,
      duelSlotCounts,
    });
  }

  const payload = await apiGet<UpcomingRunningMatchesResponse>(
    '/running/matches/upcoming',
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '다가오는 매치를 불러오지 못했어.',
    },
  );

  return sanitizeUpcomingRunningMatchesResponse(payload);
}

export async function acceptRunningMatch(input: AcceptRunningMatchInput): Promise<RunningMatchStatusResponse> {
  if (USE_MOCK_API) {
    const duelSession = syncMockRunningMatchSession('duel');
    const groupSession = syncMockRunningMatchSession('group');
    const currentSession = duelSession?.matchId === input.matchId
      ? duelSession
      : groupSession?.matchId === input.matchId
        ? groupSession
        : null;

    if (!currentSession) {
      throw new Error('수락할 매치를 찾지 못했어.');
    }

    return ensureRunningMatchStatusResponse(currentSession, {
      action: 'accept-match',
      expectedMatchId: input.matchId,
      requireMatchId: true,
    });
  }

  const payload = await apiPost<RunningMatchStatusResponse>(
    '/running/matches/accept',
    input,
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '매치 수락을 반영하지 못했어.',
    },
  );

  return ensureRunningMatchStatusResponse(payload, {
    action: 'accept-match',
    expectedMatchId: input.matchId,
    requireMatchId: true,
  });
}

export async function cancelRunningMatch(input: CancelRunningMatchInput): Promise<CancelRunningMatchResponse> {
  if (USE_MOCK_API) {
    mockApiState.runningMatchSessions[input.mode] = null;
    return { success: true };
  }

  return apiPost<CancelRunningMatchResponse>(
    '/running/matches/cancel',
    {
      ...input,
      distanceKm: Number(input.distanceKm.toFixed(1)),
      testMode: Boolean(input.testMode),
    },
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '매칭 취소를 반영하지 못했어.',
    },
  );
}

export async function leaveRunningMatch(input: LeaveRunningMatchInput): Promise<LeaveRunningMatchResponse> {
  if (USE_MOCK_API) {
    const duelSession = mockApiState.runningMatchSessions.duel;
    const groupSession = mockApiState.runningMatchSessions.group;
    const forfeitedAt = new Date().toISOString();

    if (duelSession?.matchId === input.matchId) {
      mockApiState.runningMatchSessions.duel = {
        ...duelSession,
        currentUserLiveStatus: 'forfeited',
      };
    }

    if (groupSession?.matchId === input.matchId) {
      mockApiState.runningMatchSessions.group = {
        ...groupSession,
        currentUserLiveStatus: 'forfeited',
        participants: groupSession.participants?.map((participant) => (
          participant.seedRank === (groupSession.mySeedRank ?? 1)
            ? {
              ...participant,
              liveStatus: 'forfeited',
              liveUpdatedAt: forfeitedAt,
            }
            : participant
        )),
      };
    }

    return { success: true };
  }

  return apiPost<LeaveRunningMatchResponse>(
    '/running/matches/leave',
    input,
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '매치 이탈 상태를 반영하지 못했어.',
    },
  );
}

export async function updateRunningMatchProgress(
  input: UpdateRunningMatchProgressInput,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<UpdateRunningMatchProgressResponse> {
  if (USE_MOCK_API) {
    const duelSession = syncMockRunningMatchSession('duel');
    const groupSession = syncMockRunningMatchSession('group');
    const currentSession = duelSession?.matchId === input.matchId
      ? duelSession
      : groupSession?.matchId === input.matchId
        ? groupSession
        : null;

    if (!currentSession) {
      throw new Error('진행 중인 매치를 찾지 못했어.');
    }

    if (currentSession.mode === 'duel' && currentSession.opponent) {
      const nextLiveStatus: MockMatchLiveStatus = input.status === 'finished' ? 'finished' : input.status;
      const nextSession = {
        ...currentSession,
        opponent: {
          ...currentSession.opponent,
          liveStatus: nextLiveStatus,
          liveDistanceKm: Number(input.distanceKm.toFixed(2)),
          liveElapsedSeconds: input.elapsedSeconds,
          livePace: input.currentPace,
          liveUpdatedAt: new Date().toISOString(),
          ...(input.status === 'finished' ? { finishedAt: new Date().toISOString() } : { finishedAt: undefined }),
        },
      };
      mockApiState.runningMatchSessions.duel = nextSession;
      return ensureRunningMatchProgressResponse(
        hydrateMockRunningMatchSessionStatuses(nextSession),
        {
          action: 'update-match-progress',
          expectedMatchId: input.matchId,
        },
      );
    }

    if (currentSession.mode === 'group' && currentSession.participants) {
      const nextLiveStatus: MockMatchLiveStatus = input.status === 'finished' ? 'finished' : input.status;
      const nextParticipants = currentSession.participants.map((participant) => (
        participant.seedRank === (currentSession.mySeedRank ?? 1)
          ? {
            ...participant,
            liveStatus: nextLiveStatus,
            liveDistanceKm: Number(input.distanceKm.toFixed(2)),
            liveElapsedSeconds: input.elapsedSeconds,
            livePace: input.currentPace,
            liveUpdatedAt: new Date().toISOString(),
            ...(input.status === 'finished' ? { finishedAt: new Date().toISOString() } : { finishedAt: undefined }),
          }
          : participant
      ));

      const nextSession = {
        ...currentSession,
        participants: nextParticipants,
      };
      mockApiState.runningMatchSessions.group = nextSession;
      return ensureRunningMatchProgressResponse(
        hydrateMockRunningMatchSessionStatuses(nextSession),
        {
          action: 'update-match-progress',
          expectedMatchId: input.matchId,
        },
      );
    }

    return ensureRunningMatchProgressResponse(
      hydrateMockRunningMatchSessionStatuses(currentSession),
      {
        action: 'update-match-progress',
        expectedMatchId: input.matchId,
      },
    );
  }

  const payload = await apiPost<UpdateRunningMatchProgressResponse>(
    '/running/matches/progress',
    {
      ...input,
      distanceKm: Number(input.distanceKm.toFixed(2)),
      elapsedSeconds: Math.max(0, Math.round(input.elapsedSeconds)),
    },
    {
      accessToken: await requireAccessToken(),
      fallbackMessage: '실시간 경쟁 상태를 업데이트하지 못했어.',
      signal: options.signal,
      // Heartbeat fires every ~2.5s; abort a stalled push fast so the next tick retries
      // instead of freezing live progress for the full default timeout. Callers (e.g. the
      // background push) may pass a shorter timeout so a hung request self-aborts before
      // their own stale guard would have to force-abort it.
      timeoutMs: options.timeoutMs ?? LIVE_MATCH_REQUEST_TIMEOUT_MS,
    },
  );

  return ensureRunningMatchProgressResponse(payload, {
    action: 'update-match-progress',
    expectedMatchId: input.matchId,
  });
}

// Thrown when the result endpoint reports the match is not yet resolvable (404 /
// not-found, or the live session/saved record cannot back a full result) — or is
// TERMINALLY gone (410 { code: 'match_gone' }, a pruned/tombstoned match). The
// result screen catches this to show a friendly "아직 결과가 없어요" state instead of
// a hard error. Distinguishable via `isMatchResultNotResolvedError`; `matchGone`
// tells callers apart the terminal 410 (never resolvable — stop waiting) from the
// retryable 404 (not resolvable YET).
export class MatchResultNotResolvedError extends Error {
  readonly matchId: string;
  readonly cause?: unknown;
  // true only for the definitive HTTP 410 { code: 'match_gone' } tombstone — the match
  // can never resolve; callers should surface a terminal state instead of re-polling.
  readonly matchGone: boolean;

  constructor(matchId: string, options: { cause?: unknown; matchGone?: boolean } = {}) {
    super(`매치 결과를 아직 불러올 수 없어: ${matchId}`);
    this.name = 'MatchResultNotResolvedError';
    this.matchId = matchId;
    this.cause = options.cause;
    this.matchGone = Boolean(options.matchGone);
  }
}

export function isMatchResultNotResolvedError(error: unknown): error is MatchResultNotResolvedError {
  return error instanceof MatchResultNotResolvedError;
}

// GET /running/matches/:matchId/result — the dedicated final-result endpoint.
// Always fetched by matchId (never from in-memory live state) so the result
// screen renders identically from the live arena and from a saved/old record.
// A 404 (or other not-found signal) is translated to MatchResultNotResolvedError
// so callers can branch on a not-yet-resolved match without string-matching.
export async function fetchMatchResult(matchId: string): Promise<MatchResultResponse> {
  const trimmedMatchId = matchId.trim();

  if (!trimmedMatchId) {
    throw new MatchResultNotResolvedError(matchId);
  }

  if (USE_MOCK_API) {
    const mockResult = buildMockMatchResultResponse(trimmedMatchId);

    if (!mockResult) {
      throw new MatchResultNotResolvedError(trimmedMatchId);
    }

    return mockResult;
  }

  try {
    return await apiGet<MatchResultResponse>(
      `/running/matches/${encodeURIComponent(trimmedMatchId)}/result`,
      {
        accessToken: await requireAccessToken(),
        fallbackMessage: '매치 결과를 불러오지 못했어.',
      },
    );
  } catch (error) {
    if (isApiError(error) && error.status === 404) {
      throw new MatchResultNotResolvedError(trimmedMatchId, { cause: error });
    }

    // §3-⑧: HTTP 410 { code: 'match_gone' } (pruned/tombstoned match) maps to the SAME
    // friendly not-resolved error type as 404 — previously it fell through to the generic
    // error screen. Marked matchGone so run-detail can terminalize instead of re-polling.
    if (isApiError(error) && error.status === 410) {
      throw new MatchResultNotResolvedError(trimmedMatchId, { cause: error, matchGone: true });
    }

    throw error;
  }
}
