import type { RunMatchResult } from '@/domain';
import {
  buildParticipantAveragePaceLabel,
  hasRemoteRunnerProgress,
  resolveParticipantDisplayDistanceKm,
  type GroupLiveStanding,
} from '@/features/runs/viewModels/matchProgress';
import { formatDuration } from '@/features/runs/tracking';
import type { DuelMatchOpponent, RunningMatchLiveStatus } from '@/lib/api/types';

export type DuelMatchResultRowModel = {
  id: string;
  resultLabel: 'WIN' | 'LOSER' | 'DRAW';
  name: string;
  paceLabel: string;
  durationLabel: string;
  distanceKm: number;
  isCurrentUser: boolean;
};

export type GroupMatchResultRowModel = {
  id: string;
  rank: number;
  name: string;
  paceLabel: string;
  durationLabel: string;
  distanceKm: number;
  isCurrentUser: boolean;
  liveStatus?: RunningMatchLiveStatus;
};

export type DuelMatchFinishModel = {
  title: string;
  summary: string;
  resultTone: NonNullable<RunMatchResult['resultTone']>;
  badgeLabel: string;
  opponentDistanceKm: number;
  gapKm: number;
  matchResult: RunMatchResult;
  rows: DuelMatchResultRowModel[];
};

export type GroupMatchFinishModel = {
  title: string;
  summary: string;
  podium: GroupLiveStanding[];
  matchResult: RunMatchResult;
  rows: GroupMatchResultRowModel[];
  statusLabel: string | null;
};

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
  const opponentForfeited = opponent.liveStatus === 'forfeited';
  const opponentHasProgress = hasRemoteRunnerProgress(opponent);
  const opponentDistanceKm = opponentForfeited || opponentHasProgress
    ? resolveParticipantDisplayDistanceKm(opponent, targetDistanceKm)
    : 0;
  const gapKm = Number(Math.abs(currentDistanceKm - opponentDistanceKm).toFixed(2));
  const isDraw = !currentForfeited && !opponentForfeited && gapKm < 0.03;
  const resultTone: NonNullable<RunMatchResult['resultTone']> = currentForfeited
    ? 'lose'
    : opponentForfeited
      ? 'win'
      : isDraw
        ? 'draw'
        : currentDistanceKm > opponentDistanceKm
          ? 'win'
          : 'lose';
  const title = currentForfeited
    ? '기권으로 대결을 마쳤어요'
    : opponentForfeited
      ? `${opponent.name}님이 기권해서 승리했어요`
      : isDraw
        ? `${opponent.name}님과 비슷한 흐름으로 마쳤어요`
        : resultTone === 'win'
          ? `${opponent.name}님을 이겼어요`
          : `${opponent.name}님에게 졌어요`;
  const summary = currentForfeited
    ? `내 기록은 ${currentDistanceKm.toFixed(2)}km로 저장되고, 대결 전적은 기권 패로 남아요.`
    : opponentForfeited
      ? `상대가 기권했고 내 기록은 ${currentDistanceKm.toFixed(2)}km로 저장돼요.`
      : isDraw
        ? `두 러너 차이가 ${gapKm.toFixed(2)}km 안쪽으로 거의 비슷했어요.`
        : resultTone === 'win'
          ? `${gapKm.toFixed(2)}km 차이로 앞서 마무리했어요.`
          : `${gapKm.toFixed(2)}km 차이로 뒤에서 마무리했어요.`;
  const badgeLabel = currentForfeited
    ? '기권 패'
    : opponentForfeited
      ? '상대 기권 승'
      : isDraw
        ? '무승부'
        : resultTone === 'win'
          ? '승리'
          : '패배';
  const opponentElapsedSeconds = opponent.liveElapsedSeconds ?? currentElapsedSeconds;
  const opponentPace = buildParticipantAveragePaceLabel(opponent, true);
  const currentRow = {
    id: 'me',
    resultLabel: isDraw ? 'DRAW' as const : resultTone === 'win' ? 'WIN' as const : 'LOSER' as const,
    name: '나',
    paceLabel: currentPaceLabel,
    durationLabel: formatDuration(currentElapsedSeconds),
    distanceKm: currentDistanceKm,
    isCurrentUser: true,
  };
  const opponentRow = {
    id: opponent.id,
    resultLabel: isDraw ? 'DRAW' as const : resultTone === 'win' ? 'LOSER' as const : 'WIN' as const,
    name: opponent.name,
    paceLabel: opponentPace,
    durationLabel: formatDuration(opponentElapsedSeconds),
    distanceKm: opponentDistanceKm,
    isCurrentUser: false,
  };
  const rows = isDraw
    ? [currentRow, opponentRow]
    : currentRow.resultLabel === 'WIN'
      ? [currentRow, opponentRow]
      : [opponentRow, currentRow];

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
  targetDistanceKm,
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
  const title = currentForfeited
    ? '기권으로 그룹 대결을 마쳤어요'
    : currentStanding.rank === 1
      ? '1위로 마무리했어요'
      : `${participantCount}명 중 ${currentStanding.rank}위로 마쳤어요`;
  const summary = currentForfeited
    ? `${participantCount}명 중 ${currentStanding.rank}위로 정리되고, 지금까지 측정한 기록은 저장돼요.`
    : currentStanding.rank === 1
      ? '마지막까지 페이스를 잘 지켜서 가장 먼저 들어왔어요.'
      : `앞 사람과 ${currentStanding.gapAheadKm?.toFixed(2) ?? '0.00'}km 차이였어요.`;
  const podium = standings.slice(0, 3);
  const rows = standings.map((participant) => ({
    id: participant.id,
    rank: participant.rank,
    name: participant.isCurrentUser ? '나' : participant.name,
    paceLabel: participant.isCurrentUser
      ? currentPaceLabel
      : buildParticipantAveragePaceLabel(participant, true),
    durationLabel: formatDuration(participant.liveElapsedSeconds ?? currentElapsedSeconds),
    distanceKm: participant.currentDistanceKm,
    isCurrentUser: participant.isCurrentUser,
    liveStatus: participant.liveStatus as RunningMatchLiveStatus | undefined,
  }));
  const hasOngoingParticipants = rows.some((participant) => (
    !['finished', 'forfeited', 'disconnected'].includes(participant.liveStatus ?? '')
    && participant.distanceKm < Math.max(0, targetDistanceKm - 0.01)
  ));

  return {
    title,
    summary,
    podium,
    rows,
    statusLabel: rows.length
      ? hasOngoingParticipants
        ? '진행중 · 들어오는 대로 순위가 계속 업데이트돼요.'
        : '결과 확정 · 모든 참가자 기록이 정리됐어요.'
      : null,
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
