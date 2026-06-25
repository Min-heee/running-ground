import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import type { LiveMatchRouteHydration } from '@/features/runs/lifecycle/liveMatchRouteHydration';
import { isMatchRoomDeleted } from '@/features/runs/lifecycle/matchRoomDeletionTombstone';
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
