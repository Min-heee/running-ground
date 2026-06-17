import {
  buildParticipantAveragePaceLabel,
  hasRemoteRunnerProgress,
  isMeasuredPaceLabel,
  resolveParticipantDisplayDistanceKm,
  type GroupLiveStanding,
} from '@/features/runs/viewModels/matchProgress';
import {
  resolveDuelBadgeLabel,
  resolveDuelCurrentRowLabel,
  resolveDuelOpponentRowLabels,
  resolveDuelResultTone,
  resolveDuelRowOrder,
  resolveDuelSummary,
  resolveDuelTitle,
  resolveGroupRowLabels,
  resolveGroupStatusLabel,
  resolveGroupSummary,
  resolveGroupTitle,
} from '@/features/runs/viewModels/matchResultRowsPolicy';
import { formatDuration } from '@/features/runs/tracking';
import type {
  DuelMatchOpponent,
  DuelVerdict,
  RunningMatchLiveStatus,
} from '@/lib/api/types';
import type {
  DuelMatchFinishModel,
  DuelMatchResultRowModel,
  GroupMatchFinishModel,
  GroupMatchResultRowModel,
  MatchResultTone,
} from '@/features/runs/types/matchResult';

export type {
  DuelMatchFinishModel,
  DuelMatchResultRowModel,
  GroupMatchFinishModel,
  GroupMatchResultRowModel,
} from '@/features/runs/types/matchResult';

// The duel verdict is the server's single source of truth, but only once it has actually
// RESOLVED. A `duelVerdict` whose `resolved` is false (outcome === 'pending') is still
// pending — the client must keep its local placeholders and never flip to a final 승/패.
// Likewise an ABSENT verdict (older backend that has not redeployed) falls through to the
// pure-local heuristics below, so deploy skew degrades gracefully instead of crashing or
// pinning the card on "pending" forever.
function isResolvedDuelVerdict(verdict?: DuelVerdict | null): verdict is DuelVerdict {
  return Boolean(verdict && verdict.resolved && verdict.outcome !== 'pending');
}

export function buildDuelMatchFinishModel({
  opponent,
  currentDistanceKm,
  targetDistanceKm,
  currentElapsedSeconds,
  currentPaceLabel,
  currentUserLiveStatus,
  duelVerdict,
  currentUserFinishElapsedSeconds,
}: {
  opponent: DuelMatchOpponent | null;
  currentDistanceKm: number;
  targetDistanceKm: number;
  currentElapsedSeconds: number;
  currentPaceLabel: string;
  currentUserLiveStatus?: RunningMatchLiveStatus | null;
  duelVerdict?: DuelVerdict | null;
  currentUserFinishElapsedSeconds?: number | null;
}): DuelMatchFinishModel | null {
  if (!opponent) {
    return null;
  }

  const currentForfeited = currentUserLiveStatus === 'forfeited';
  const currentFinished = currentUserLiveStatus === 'finished';
  const opponentForfeited = opponent.liveStatus === 'forfeited';
  const opponentFinished = opponent.liveStatus === 'finished';
  const opponentInProgress = currentFinished && !opponentForfeited && !opponentFinished;
  const opponentHasProgress = hasRemoteRunnerProgress(opponent);
  const opponentDistanceKm = opponentForfeited || opponentHasProgress
    ? resolveParticipantDisplayDistanceKm(opponent, targetDistanceKm)
    : 0;
  const gapKm = Number(Math.abs(currentDistanceKm - opponentDistanceKm).toFixed(2));

  // C2: when the server has RESOLVED the duel, its verdict — not the local distance/finish
  // -order heuristic — decides win/lose/draw. A forfeit still wins/loses by the forfeit
  // rules (the verdict's outcome already reflects forfeits), but we keep the local forfeit
  // copy/labels below so the "기권" UX is unchanged.
  const verdictResolved = isResolvedDuelVerdict(duelVerdict);
  const verdictResultTone: MatchResultTone | null = verdictResolved
    ? (duelVerdict.outcome as MatchResultTone)
    : null;

  // Self finish time/pace come from the server when it has frozen them (so both phones show
  // the SAME official numbers). Fall back to the local frozen values only when the server
  // has not provided them yet (deploy skew / pre-finish).
  const hasServerSelfFinish = verdictResolved
    && typeof duelVerdict.myFinishElapsedSeconds === 'number'
    && Number.isFinite(duelVerdict.myFinishElapsedSeconds);
  const resolvedCurrentElapsedSeconds = hasServerSelfFinish
    ? duelVerdict.myFinishElapsedSeconds!
    : typeof currentUserFinishElapsedSeconds === 'number' && Number.isFinite(currentUserFinishElapsedSeconds)
      ? currentUserFinishElapsedSeconds
      : currentElapsedSeconds;
  const resolvedCurrentPaceLabel = hasServerSelfFinish && isMeasuredPaceLabel(duelVerdict.myPaceLabel)
    ? duelVerdict.myPaceLabel!
    : currentPaceLabel;

  // Opponent finish time/pace from the verdict when resolved + present.
  const hasServerOpponentFinish = verdictResolved
    && typeof duelVerdict.opponentFinishElapsedSeconds === 'number'
    && Number.isFinite(duelVerdict.opponentFinishElapsedSeconds);
  const serverOpponentPaceLabel = verdictResolved && isMeasuredPaceLabel(duelVerdict.opponentPaceLabel)
    ? duelVerdict.opponentPaceLabel!
    : null;

  const bothOfficiallyFinished = currentFinished && opponentFinished && !currentForfeited && !opponentForfeited;
  const officialResultTone: MatchResultTone | null = bothOfficiallyFinished
    && typeof opponent.officialRank === 'number'
    && Number.isFinite(opponent.officialRank)
    ? (opponent.officialRank === 1 ? 'lose' : 'win')
    : null;
  // Draw: server outcome wins when resolved; otherwise keep the local near-equal heuristic.
  const isDraw = verdictResolved
    ? duelVerdict.outcome === 'draw'
    : officialResultTone
      ? false
      : !currentForfeited && !opponentForfeited && !opponentInProgress && gapKm < 0.03;
  const resultTone = verdictResultTone ?? officialResultTone ?? resolveDuelResultTone({
    currentForfeited,
    opponentForfeited,
    opponentInProgress,
    isDraw,
    currentDistanceKm,
    opponentDistanceKm,
  });
  const title = resolveDuelTitle({
    opponentName: opponent.name,
    currentForfeited,
    opponentForfeited,
    opponentInProgress,
    isDraw,
    resultTone,
  });
  const summary = resolveDuelSummary({
    currentForfeited,
    opponentForfeited,
    opponentInProgress,
    isDraw,
    resultTone,
    currentDistanceKm,
    gapKm,
  });
  const badgeLabel = resolveDuelBadgeLabel({
    currentForfeited,
    opponentForfeited,
    isDraw,
    resultTone,
  });
  // Opponent finish elapsed: prefer the server's frozen value once resolved (keeps both
  // phones identical), then their live elapsed, then the forfeit-zero / current fallback.
  // The forfeit branch is untouched so "기권"/"00:00" still render exactly as before.
  const opponentElapsedSeconds = opponentForfeited
    ? (opponent.liveElapsedSeconds ?? 0)
    : hasServerOpponentFinish
      ? duelVerdict.opponentFinishElapsedSeconds!
      : (opponent.liveElapsedSeconds ?? currentElapsedSeconds);
  const opponentHasLiveElapsed = hasServerOpponentFinish
    || (typeof opponent.liveElapsedSeconds === 'number'
      && Number.isFinite(opponent.liveElapsedSeconds)
      && opponent.liveElapsedSeconds > 0);
  const resolvedOpponentPace = !opponentForfeited && serverOpponentPaceLabel
    ? serverOpponentPaceLabel
    : buildParticipantAveragePaceLabel(opponent, true);
  const opponentPace = opponentForfeited && !isMeasuredPaceLabel(resolvedOpponentPace)
    ? '기권'
    : resolvedOpponentPace;
  const currentRow: DuelMatchResultRowModel = {
    id: 'me',
    resultLabel: resolveDuelCurrentRowLabel({ isDraw, resultTone, currentForfeited }),
    name: '나',
    // C4: the 나 column pace + duration come from the SAME finish elapsed/distance the
    // server froze (when resolved), so the result card 나 pace and the bottom metric pace
    // never diverge (the 6:17-vs-6:14 bug).
    paceLabel: resolvedCurrentPaceLabel,
    durationLabel: formatDuration(resolvedCurrentElapsedSeconds),
    distanceKm: currentDistanceKm,
    isCurrentUser: true,
  };
  const opponentRowLabels = resolveDuelOpponentRowLabels({
    opponentInProgress,
    isDraw,
    resultTone,
    opponentForfeited,
    opponentPaceLabel: opponentPace,
    opponentDurationLabel: formatDuration(opponentElapsedSeconds),
    opponentHasLiveProgress: opponentHasLiveElapsed,
  });
  const opponentRow: DuelMatchResultRowModel = {
    id: opponent.id,
    resultLabel: opponentRowLabels.resultLabel,
    name: opponent.name,
    paceLabel: opponentRowLabels.paceLabel,
    durationLabel: opponentRowLabels.durationLabel,
    distanceKm: opponentDistanceKm,
    isCurrentUser: false,
    isInProgress: opponentInProgress,
  };
  const rows = resolveDuelRowOrder({
    currentRow,
    opponentRow,
    opponentInProgress,
    isDraw,
  });

  return {
    title,
    summary,
    resultTone,
    badgeLabel,
    opponentDistanceKm,
    gapKm,
    rows,
    matchResult: {
      mode: 'duel',
      title,
      summary,
      badgeLabel,
      opponentId: opponent.id,
      opponentName: opponent.name,
      resultTone,
      gapKm,
      comparedDistanceKm: opponentDistanceKm,
      // C4: persist the SAME pace the 나 column shows (server-frozen when resolved).
      myPaceLabel: resolvedCurrentPaceLabel,
      // Durations must be whole seconds — the backend validates them as positive
      // integers, so a raw float elapsed (esp. the opponent's synced liveElapsed)
      // would 400 the whole run save and strand the runner on the live screen.
      myDurationSeconds: Math.round(resolvedCurrentElapsedSeconds),
      // Persist the opponent's pace/time only when it is genuinely theirs: a measured
      // pace, and an elapsed that actually came from their live sync. The previous code
      // stored a '--:--/km' placeholder, and — when their progress had not synced —
      // silently saved MY elapsed (the `?? currentElapsedSeconds` fallback) as the
      // opponent's. Omitting instead means the saved 대결 카드 shows nothing for the
      // opponent rather than a wrong value when their live data is missing.
      ...(isMeasuredPaceLabel(opponentPace) ? { opponentPaceLabel: opponentPace } : {}),
      ...(opponentHasLiveElapsed
        ? { opponentDurationSeconds: Math.round(opponentElapsedSeconds) }
        : {}),
    },
  };
}

export function buildGroupMatchFinishModel({
  currentStanding,
  participantCount,
  standings,
  currentPaceLabel,
  currentElapsedSeconds,
}: {
  currentStanding: GroupLiveStanding | null;
  participantCount: number;
  standings: GroupLiveStanding[];
  currentPaceLabel: string;
  currentElapsedSeconds: number;
  targetDistanceKm: number;
}): GroupMatchFinishModel | null {
  if (!currentStanding || !participantCount) {
    return null;
  }

  const currentForfeited = currentStanding.liveStatus === 'forfeited' || currentStanding.isForfeited;
  const title = resolveGroupTitle({
    currentForfeited,
    currentRank: currentStanding.rank,
    participantCount,
  });
  const summary = resolveGroupSummary({
    currentForfeited,
    currentRank: currentStanding.rank,
    participantCount,
    gapAheadKm: currentStanding.gapAheadKm,
  });
  const podium = standings.slice(0, 3);
  const rows: GroupMatchResultRowModel[] = standings.map((participant) => {
    const isInProgress = participant.liveStatus !== 'finished' && participant.liveStatus !== 'forfeited';
    const participantHasLiveElapsed = typeof participant.liveElapsedSeconds === 'number'
      && Number.isFinite(participant.liveElapsedSeconds)
      && participant.liveElapsedSeconds > 0;
    const participantPaceLabel = buildParticipantAveragePaceLabel(participant, true);
    const rowLabels = resolveGroupRowLabels({
      isInProgress,
      isCurrentUser: participant.isCurrentUser,
      currentPaceLabel,
      participantPaceLabel: participant.liveStatus === 'forfeited' && !isMeasuredPaceLabel(participantPaceLabel)
        ? '기권'
        : participantPaceLabel,
      durationLabel: formatDuration(
        participant.liveStatus === 'forfeited'
          ? (participant.liveElapsedSeconds ?? 0)
          : (participant.liveElapsedSeconds ?? currentElapsedSeconds),
      ),
      participantHasLiveProgress: participantHasLiveElapsed,
    });

    return {
      id: participant.id,
      rank: participant.rank,
      name: participant.isCurrentUser ? '나' : participant.name,
      paceLabel: rowLabels.paceLabel,
      durationLabel: rowLabels.durationLabel,
      distanceKm: participant.currentDistanceKm,
      isCurrentUser: participant.isCurrentUser,
      liveStatus: participant.liveStatus as RunningMatchLiveStatus | undefined,
      isInProgress: rowLabels.isInProgress,
    };
  });
  const hasOngoingParticipants = rows.some((participant) => participant.isInProgress);

  return {
    title,
    summary,
    podium,
    rows,
    statusLabel: resolveGroupStatusLabel({
      hasRows: rows.length > 0,
      hasOngoing: hasOngoingParticipants,
    }),
    matchResult: {
      mode: 'group',
      title,
      summary,
      badgeLabel: currentForfeited ? '기권' : `${currentStanding.rank}위`,
      rank: currentStanding.rank,
      participantCount,
      gapKm: currentStanding.gapAheadKm ?? undefined,
    },
  };
}
