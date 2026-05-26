import {
  buildParticipantAveragePaceLabel,
  hasRemoteRunnerProgress,
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
import type { DuelMatchOpponent, RunningMatchLiveStatus } from '@/lib/api/types';
import type {
  DuelMatchFinishModel,
  DuelMatchResultRowModel,
  GroupMatchFinishModel,
  GroupMatchResultRowModel,
} from '@/features/runs/types/matchResult';

export type {
  DuelMatchFinishModel,
  DuelMatchResultRowModel,
  GroupMatchFinishModel,
  GroupMatchResultRowModel,
} from '@/features/runs/types/matchResult';

export function buildDuelMatchFinishModel({
  opponent,
  currentDistanceKm,
  targetDistanceKm,
  currentElapsedSeconds,
  currentPaceLabel,
  currentUserLiveStatus,
}: {
  opponent: DuelMatchOpponent | null;
  currentDistanceKm: number;
  targetDistanceKm: number;
  currentElapsedSeconds: number;
  currentPaceLabel: string;
  currentUserLiveStatus?: RunningMatchLiveStatus | null;
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
  const isDraw = !currentForfeited && !opponentForfeited && !opponentInProgress && gapKm < 0.03;
  const resultTone = resolveDuelResultTone({
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
  const opponentElapsedSeconds = opponent.liveElapsedSeconds ?? currentElapsedSeconds;
  const opponentPace = buildParticipantAveragePaceLabel(opponent, true);
  const currentRow: DuelMatchResultRowModel = {
    id: 'me',
    resultLabel: resolveDuelCurrentRowLabel({ isDraw, resultTone, currentForfeited }),
    name: '나',
    paceLabel: currentPaceLabel,
    durationLabel: formatDuration(currentElapsedSeconds),
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
      opponentName: opponent.name,
      resultTone,
      gapKm,
      comparedDistanceKm: opponentDistanceKm,
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
    const rowLabels = resolveGroupRowLabels({
      isInProgress,
      isCurrentUser: participant.isCurrentUser,
      currentPaceLabel,
      participantPaceLabel: buildParticipantAveragePaceLabel(participant, true),
      durationLabel: formatDuration(participant.liveElapsedSeconds ?? currentElapsedSeconds),
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
