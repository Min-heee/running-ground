import { useEffect, useMemo, useRef } from 'react';
import type { RunMatchResult } from '@/domain';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import {
  type GroupLiveStanding,
} from '@/features/runs/viewModels/matchProgress';
import {
  buildDuelMatchFinishModel,
  buildGroupMatchFinishModel,
} from '@/features/runs/viewModels/matchResultModel';
import {
  getEstimatedMatchBonusPoints,
  getEstimatedMatchLpDelta,
} from '@/features/runs/utils/matchScheduling';
import type {
  DuelMatchOpponent,
  DuelVerdict,
  GroupVerdict,
  RunningMatchLiveStatus,
} from '@/lib/api/types';

type UseMatchResultControllerInput = {
  matchMode: RunMatchMode;
  isPartyRun?: boolean;
  effectiveDuelOpponent: DuelMatchOpponent | null;
  currentGroupStanding: GroupLiveStanding | null;
  effectiveGroupParticipantCount: number;
  groupLiveStandings: GroupLiveStanding[];
  currentUserArenaPace: string;
  currentUserDuelLiveStatus?: RunningMatchLiveStatus | null;
  distanceKm: number;
  duelDistanceKm: number;
  groupDistanceKm: number;
  elapsedSeconds: number;
  // C2: server-authoritative duel verdict + the user's own frozen finish elapsed. Both are
  // optional/absent on older backends — the model degrades to today's local behavior then.
  duelVerdict?: DuelVerdict | null;
  currentUserFinishElapsedSeconds?: number | null;
  // C (group parity): server-authoritative group final placement. Optional/absent on older
  // backends — the group model degrades to a PENDING placeholder then (never a wrong rank).
  groupVerdict?: GroupVerdict | null;
  // C1: the active match id. Present => server-tracked duel/group whose verdict is authoritative,
  // so an unresolved result is held PENDING rather than locally invented.
  matchId?: string | null;
  // 오너 2026-08-28: 결과 행의 내 이름도 무조건 닉네임 — '나'는 프로필 이름 부재 폴백.
  // 세션 모듈을 여기서 import하면 RN 의존이 딸려와 노드 테스트가 죽으므로 호출부가 넣는다.
  currentUserName?: string | null;
};

type FrozenDuelResultMetrics = {
  distanceKm: number;
  elapsedSeconds: number;
  paceLabel: string;
};

export function resolveEstimatedMatchLpDelta({
  isPartyRun = false,
  trackedMatchResult,
}: {
  isPartyRun?: boolean;
  trackedMatchResult?: RunMatchResult | null;
}) {
  return isPartyRun ? 0 : getEstimatedMatchLpDelta(trackedMatchResult ?? undefined);
}

// F4 (client latch): a RESOLVED duel verdict is terminal. Once latched it must survive a
// later poll that, near the §B4 fallback boundary, carries an unresolved or differing
// verdict — the displayed result can never revert to pending or flip the winner. The latch
// is keyed to the opponent identity: a brand-new match (different opponent, including the
// transition from no-opponent) drops the latch so a fresh duel starts clean. Pure so it can
// be unit-tested without rendering the hook; the hook threads it through refs.
export function resolveLatchedDuelVerdict({
  matchMode,
  latchedVerdict,
  latchedOpponentId,
  currentOpponentId,
  incomingVerdict,
}: {
  matchMode: RunMatchMode;
  latchedVerdict: DuelVerdict | null;
  latchedOpponentId: string | null;
  currentOpponentId: string | null;
  incomingVerdict?: DuelVerdict | null;
}): { latchedVerdict: DuelVerdict | null; effectiveVerdict: DuelVerdict | null | undefined } {
  // Reset the latch whenever the opponent identity changes (new/cleared match).
  let nextLatched = latchedOpponentId !== currentOpponentId ? null : latchedVerdict;

  if (
    matchMode === 'duel'
    && !nextLatched
    && incomingVerdict
    && incomingVerdict.resolved
    && incomingVerdict.outcome !== 'pending'
  ) {
    nextLatched = incomingVerdict;
  }

  return {
    latchedVerdict: nextLatched,
    effectiveVerdict: matchMode === 'duel' ? (nextLatched ?? incomingVerdict) : incomingVerdict,
  };
}

export function useMatchResultController({
  matchMode,
  isPartyRun = false,
  effectiveDuelOpponent,
  currentGroupStanding,
  effectiveGroupParticipantCount,
  groupLiveStandings,
  currentUserArenaPace,
  currentUserDuelLiveStatus,
  distanceKm,
  duelDistanceKm,
  groupDistanceKm,
  elapsedSeconds,
  duelVerdict,
  currentUserFinishElapsedSeconds,
  groupVerdict,
  matchId,
  currentUserName,
}: UseMatchResultControllerInput) {
  const duelFrozenRef = useRef<FrozenDuelResultMetrics | null>(null);
  const isCurrentUserDuelFinished = currentUserDuelLiveStatus === 'finished';

  // F4 (client latch): once the server duel verdict has RESOLVED, latch it as terminal so
  // a later poll near the §B4 fallback boundary can't revert/flip the displayed result.
  // The server seals the verdict too (F4 server seal); this is belt-and-suspenders for
  // transient client-side response skew. Decision logic lives in the pure, unit-tested
  // resolveLatchedDuelVerdict; the refs only persist the latch across renders.
  const latchedDuelVerdictRef = useRef<DuelVerdict | null>(null);
  const latchedOpponentIdRef = useRef<string | null>(null);
  const currentOpponentId = effectiveDuelOpponent?.id ?? null;
  const { latchedVerdict: nextLatchedVerdict, effectiveVerdict: effectiveDuelVerdict } = resolveLatchedDuelVerdict({
    matchMode,
    latchedVerdict: latchedDuelVerdictRef.current,
    latchedOpponentId: latchedOpponentIdRef.current,
    currentOpponentId,
    incomingVerdict: duelVerdict,
  });
  latchedDuelVerdictRef.current = nextLatchedVerdict;
  latchedOpponentIdRef.current = currentOpponentId;

  useEffect(() => {
    if (matchMode !== 'duel' || !isCurrentUserDuelFinished) {
      duelFrozenRef.current = null;
      return;
    }

    if (duelFrozenRef.current) {
      return;
    }

    duelFrozenRef.current = {
      distanceKm,
      elapsedSeconds,
      paceLabel: currentUserArenaPace,
    };
  }, [
    currentUserArenaPace,
    distanceKm,
    elapsedSeconds,
    isCurrentUserDuelFinished,
    matchMode,
  ]);

  const duelFinishSummary = useMemo(
    () => {
      const frozen = duelFrozenRef.current;
      const effectiveDistanceKm = isCurrentUserDuelFinished && frozen
        ? frozen.distanceKm
        : distanceKm;
      const effectiveElapsedSeconds = isCurrentUserDuelFinished && frozen
        ? frozen.elapsedSeconds
        : elapsedSeconds;
      const effectivePaceLabel = isCurrentUserDuelFinished && frozen
        ? frozen.paceLabel
        : currentUserArenaPace;

      return buildDuelMatchFinishModel({
        opponent: effectiveDuelOpponent,
        currentDistanceKm: effectiveDistanceKm,
        targetDistanceKm: duelDistanceKm,
        // The local frozen self time/pace is only a PLACEHOLDER while the server verdict is
        // pending; once resolved the model swaps in the server's frozen finish + pace.
        currentElapsedSeconds: effectiveElapsedSeconds,
        currentPaceLabel: effectivePaceLabel,
        currentUserLiveStatus: currentUserDuelLiveStatus,
        currentUserName,
        // F4: the LATCHED verdict — never reverts once resolved.
        duelVerdict: effectiveDuelVerdict,
        currentUserFinishElapsedSeconds,
        // C1: presence marks a server-tracked duel → unresolved result is held PENDING.
        matchId,
      });
    },
    [
      currentUserArenaPace,
      currentUserDuelLiveStatus,
      currentUserFinishElapsedSeconds,
      currentUserName,
      distanceKm,
      duelDistanceKm,
      effectiveDuelVerdict,
      effectiveDuelOpponent,
      elapsedSeconds,
      isCurrentUserDuelFinished,
      matchId,
    ],
  );

  const groupFinishSummary = useMemo(
    () => buildGroupMatchFinishModel({
      currentStanding: currentGroupStanding,
      participantCount: effectiveGroupParticipantCount,
      standings: groupLiveStandings,
      currentPaceLabel: currentUserArenaPace,
      currentElapsedSeconds: elapsedSeconds,
      targetDistanceKm: groupDistanceKm,
      // C (group parity): the server-authoritative final placement, when present + resolved.
      groupVerdict,
      // C (group parity): presence marks a server-tracked group → unresolved result is held PENDING.
      matchId,
    }),
    [currentGroupStanding, currentUserArenaPace, effectiveGroupParticipantCount, elapsedSeconds, groupDistanceKm, groupLiveStandings, groupVerdict, matchId],
  );

  const trackedMatchResult = matchMode === 'duel'
    ? duelFinishSummary?.matchResult
    : matchMode === 'group'
      ? groupFinishSummary?.matchResult
      : undefined;

  const estimatedMatchBonusPoints = useMemo(
    () => getEstimatedMatchBonusPoints(trackedMatchResult),
    [trackedMatchResult],
  );
  const estimatedMatchLpDelta = useMemo(
    () => resolveEstimatedMatchLpDelta({ isPartyRun, trackedMatchResult }),
    [isPartyRun, trackedMatchResult],
  );

  const duelResultRows = matchMode === 'duel' ? duelFinishSummary?.rows ?? [] : [];
  const groupResultRows = matchMode === 'group' ? groupFinishSummary?.rows ?? [] : [];
  const groupResultStatusLabel = matchMode === 'group' ? groupFinishSummary?.statusLabel ?? null : null;

  return {
    duelFinishSummary,
    groupFinishSummary,
    trackedMatchResult,
    estimatedMatchBonusPoints,
    estimatedMatchLpDelta,
    duelResultRows,
    groupResultRows,
    groupResultStatusLabel,
  };
}
