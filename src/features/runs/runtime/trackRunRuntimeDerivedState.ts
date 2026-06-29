import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import type { LiveMatchRouteHydration } from '@/features/runs/lifecycle/liveMatchRouteHydration';
import { isMatchRoomDeleted } from '@/features/runs/lifecycle/matchRoomDeletionTombstone';
import type { PartyRunLinkedMatchContext } from '@/features/runs/lifecycle/matchStateMachine';
import {
  buildAverageArenaPaceLabel,
  buildParticipantAveragePaceLabel,
  isMeasuredPaceLabel,
} from '@/features/runs/viewModels/matchProgress';
import type { ArenaParticipantViewModel } from '@/features/runs/viewModels/matchViewModels';
import type { DuelMatchOpponent } from '@/lib/api/types';

export function resolveTrackRunRuntimeRouteHydration({
  focusMatchMode,
  focusMatchId,
  focusMatchDistanceKm,
  focusMatchSlotStartAt,
  focusMatchNonce,
  forceMatchArena,
  focusRoomId,
  liveMatchRouteHydration,
}: {
  focusMatchMode?: Extract<RunMatchMode, 'duel' | 'group'>;
  focusMatchId?: string;
  focusMatchDistanceKm?: number;
  focusMatchSlotStartAt?: string;
  focusMatchNonce?: string;
  forceMatchArena?: boolean;
  focusRoomId?: string;
  liveMatchRouteHydration: LiveMatchRouteHydration | null;
}) {
  const hydratedFocusMatchMode = focusMatchMode ?? liveMatchRouteHydration?.mode;
  const hydratedFocusMatchId = focusMatchId ?? (
    liveMatchRouteHydration?.mode === hydratedFocusMatchMode
      ? liveMatchRouteHydration?.matchId
      : undefined
  );
  const rawHydratedFocusRoomId = focusRoomId ?? liveMatchRouteHydration?.roomId ?? undefined;

  return {
    hydratedFocusMatchMode,
    hydratedFocusMatchId,
    hydratedFocusRoomId: isMatchRoomDeleted(rawHydratedFocusRoomId)
      ? undefined
      : rawHydratedFocusRoomId,
    hydratedFocusMatchDistanceKm: focusMatchDistanceKm ?? liveMatchRouteHydration?.distanceKm,
    hydratedFocusMatchSlotStartAt: focusMatchSlotStartAt ?? liveMatchRouteHydration?.slotStartAt,
    hydratedForceMatchArena: forceMatchArena ?? liveMatchRouteHydration?.preferArena,
    hydratedFocusMatchNonce: focusMatchNonce ?? liveMatchRouteHydration?.nonce,
  };
}

// The not-ready sentinel already used elsewhere for distanceKm<=0 (see matchProgress.ts) —
// reuse it so a stale MY-distance reads as "not measured yet", not as a real (ballooned) pace.
const NOT_READY_PACE_LABEL = '--:--/km';

export function resolveCurrentUserArenaPace({
  officialCurrentAveragePace,
  liveMatchDisplayDistanceKm,
  liveMatchDisplayElapsedSeconds,
  shouldUseLivePace,
  isMyDistanceStale = false,
}: {
  officialCurrentAveragePace: string | null;
  liveMatchDisplayDistanceKm: number;
  liveMatchDisplayElapsedSeconds: number;
  shouldUseLivePace: boolean;
  // When MY live distance is stale (screen-off JS freeze: distance frozen, elapsed climbing) the
  // cumulative live avg pace balloons, so render the not-ready sentinel instead. Official pace is
  // server-authoritative (not JS-frozen), so it is shown unchanged even while stale. Staleness is
  // timestamp-based, NEVER pace magnitude — a slow/walking-but-fresh pace is not suppressed.
  isMyDistanceStale?: boolean;
}) {
  if (isMeasuredPaceLabel(officialCurrentAveragePace)) {
    return officialCurrentAveragePace!;
  }

  if (isMyDistanceStale) {
    return NOT_READY_PACE_LABEL;
  }

  return buildAverageArenaPaceLabel(
    liveMatchDisplayDistanceKm,
    liveMatchDisplayElapsedSeconds,
    shouldUseLivePace,
  );
}

export function resolveDuelLiveSummary({
  opponent,
  opponentArenaPace,
  opponentStatusLabel,
  isOpponentForfeited,
}: {
  opponent: Pick<DuelMatchOpponent, 'name'> | null;
  opponentArenaPace: string;
  opponentStatusLabel?: string | null;
  isOpponentForfeited: boolean;
}) {
  if (!opponent) {
    return '상대 러너 정보를 불러오는 중이에요.';
  }

  if (isOpponentForfeited) {
    return `${opponent.name}님 · 기권`;
  }

  return `${opponent.name}님${opponentArenaPace ? ` · ${opponentArenaPace}` : ''}${opponentStatusLabel ? ` · ${opponentStatusLabel}` : ''}`;
}

export function resolveRoomLinkedDuelProgress(participants: ArenaParticipantViewModel[]) {
  const currentParticipant = participants.find((participant) => participant.isCurrentUser) ?? null;
  const opponentParticipant = participants.find((participant) => !participant.isCurrentUser) ?? null;
  const gapKm = currentParticipant && opponentParticipant
    ? Number((currentParticipant.distanceKm - opponentParticipant.distanceKm).toFixed(2))
    : null;
  const hasLiveProgress = Boolean(
    currentParticipant
    && opponentParticipant
    && (
      currentParticipant.distanceKm > 0
      || opponentParticipant.distanceKm > 0
    ),
  );

  return {
    roomLinkedDuelCurrentParticipant: currentParticipant,
    roomLinkedDuelOpponentParticipant: opponentParticipant,
    roomLinkedDuelGapKm: gapKm,
    hasRoomLinkedDuelLiveProgress: hasLiveProgress,
  };
}

export function resolveDuelOpponentArenaPace({
  opponent,
  duelArenaUsesLivePace,
}: {
  opponent: DuelMatchOpponent | null;
  duelArenaUsesLivePace: boolean;
}) {
  return buildParticipantAveragePaceLabel(opponent, duelArenaUsesLivePace);
}

// Group sole-survivor: I'm still active but every OTHER participant has left the race
// (forfeited / finished / disconnected). The exit card must then offer a finish action
// ("대결 종료") instead of "기권하기", so I'm not penalized as a forfeiter.
export function resolveActiveMatchExitAllOthersForfeited({
  activeMatchExitSource,
  groupArenaParticipants,
  currentUserGroupLiveStatus,
  currentUserHasForfeitedActiveMatch,
}: {
  activeMatchExitSource: 'duel' | 'group' | null;
  groupArenaParticipants: ArenaParticipantViewModel[];
  currentUserGroupLiveStatus: ArenaParticipantViewModel['liveStatus'] | null;
  currentUserHasForfeitedActiveMatch: boolean;
}) {
  if (activeMatchExitSource !== 'group') {
    return false;
  }
  const others = groupArenaParticipants.filter((participant) => !participant.isCurrentUser);
  if (others.length === 0) {
    return false;
  }
  const allOthersDone = others.every((participant) =>
    participant.liveStatus === 'forfeited'
    || participant.liveStatus === 'finished'
    || participant.liveStatus === 'disconnected',
  );
  const selfDone = currentUserGroupLiveStatus === 'finished'
    || currentUserGroupLiveStatus === 'forfeited'
    || currentUserHasForfeitedActiveMatch;
  return allOthersDone && !selfDone;
}

export function resolveActiveLiveMatchProgressMatchId({
  matchMode,
  duelMatchStatusMatchId,
  groupMatchStatusMatchId,
  roomLinkedMatchContextMatchId,
  roomLinkedMatchContextMode,
}: {
  matchMode: RunMatchMode;
  duelMatchStatusMatchId: string | undefined;
  groupMatchStatusMatchId: string | undefined;
  roomLinkedMatchContextMatchId: string | undefined;
  roomLinkedMatchContextMode: PartyRunLinkedMatchContext['mode'] | undefined;
}): string | null {
  if (matchMode === 'duel') {
    return duelMatchStatusMatchId
      ?? (roomLinkedMatchContextMode === 'duel' ? roomLinkedMatchContextMatchId ?? null : null);
  }

  if (matchMode === 'group') {
    return groupMatchStatusMatchId
      ?? (roomLinkedMatchContextMode === 'group' ? roomLinkedMatchContextMatchId ?? null : null);
  }

  return null;
}

export function isRunningMatchForceResetCandidate(message: string | null) {
  if (!message) {
    return false;
  }

  return (
    message.includes('이미')
    && (
      message.includes('방')
      || message.includes('매치')
      || message.includes('매칭')
      || message.includes('대결')
    )
  );
}
