import { useMemo } from 'react';
import type { RunMatchResult } from '@/domain/types';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import {
  buildParticipantAveragePaceLabel,
  hasRemoteRunnerProgress,
  resolveParticipantDisplayDistanceKm,
  type GroupLiveStanding,
} from '@/features/runs/matchProgress';
import { getEstimatedMatchBonusPoints } from '@/features/runs/matchScheduling';
import { formatDuration } from '@/features/runs/tracking';
import type {
  DuelMatchOpponent,
  RunningMatchLiveStatus,
} from '@/lib/api/types';

type UseMatchResultControllerInput = {
  matchMode: RunMatchMode;
  effectiveDuelOpponent: DuelMatchOpponent | null;
  currentGroupStanding: GroupLiveStanding | null;
  effectiveGroupParticipantCount: number;
  groupLiveStandings: GroupLiveStanding[];
  currentUserArenaPace: string;
  distanceKm: number;
  duelDistanceKm: number;
  groupDistanceKm: number;
  elapsedSeconds: number;
};

export function useMatchResultController({
  matchMode,
  effectiveDuelOpponent,
  currentGroupStanding,
  effectiveGroupParticipantCount,
  groupLiveStandings,
  currentUserArenaPace,
  distanceKm,
  duelDistanceKm,
  groupDistanceKm,
  elapsedSeconds,
}: UseMatchResultControllerInput) {
  const duelFinishSummary = useMemo(() => {
    if (!effectiveDuelOpponent) {
      return null;
    }

    const opponentForfeited = effectiveDuelOpponent.liveStatus === 'forfeited';
    const opponentHasProgress = hasRemoteRunnerProgress(effectiveDuelOpponent);
    const opponentDistanceKm = opponentForfeited || opponentHasProgress
      ? resolveParticipantDisplayDistanceKm(effectiveDuelOpponent, duelDistanceKm)
      : 0;
    const gapKm = Number(Math.abs(distanceKm - opponentDistanceKm).toFixed(2));
    const isDraw = !opponentForfeited && gapKm < 0.03;
    const resultTone: RunMatchResult['resultTone'] = opponentForfeited
      ? 'win'
      : isDraw
        ? 'draw'
        : distanceKm > opponentDistanceKm
          ? 'win'
          : 'lose';
    const title = opponentForfeited
      ? `${effectiveDuelOpponent.name}님이 기권해서 승리했어요`
      : isDraw
        ? `${effectiveDuelOpponent.name}님과 비슷한 흐름으로 마쳤어요`
        : resultTone === 'win'
          ? `${effectiveDuelOpponent.name}님을 이겼어요`
          : `${effectiveDuelOpponent.name}님에게 졌어요`;
    const summary = opponentForfeited
      ? `상대가 기권했고 내 기록은 ${distanceKm.toFixed(2)}km로 저장돼요.`
      : isDraw
        ? `두 러너 차이가 ${gapKm.toFixed(2)}km 안쪽으로 거의 비슷했어요.`
        : resultTone === 'win'
          ? `${gapKm.toFixed(2)}km 차이로 앞서 마무리했어요.`
          : `${gapKm.toFixed(2)}km 차이로 뒤에서 마무리했어요.`;
    const badgeLabel = opponentForfeited ? '상대 기권 승' : isDraw ? '무승부' : resultTone === 'win' ? '승리' : '패배';

    return {
      title,
      summary,
      resultTone,
      badgeLabel,
      opponentDistanceKm,
      gapKm,
    };
  }, [distanceKm, duelDistanceKm, effectiveDuelOpponent]);

  const groupFinishSummary = useMemo(() => {
    if (!currentGroupStanding || !effectiveGroupParticipantCount) {
      return null;
    }

    const title = currentGroupStanding.rank === 1
      ? '1위로 마무리했어요'
      : `${effectiveGroupParticipantCount}명 중 ${currentGroupStanding.rank}위로 마쳤어요`;
    const summary = currentGroupStanding.rank === 1
      ? '마지막까지 페이스를 잘 지켜서 가장 먼저 들어왔어요.'
      : `앞 사람과 ${currentGroupStanding.gapAheadKm?.toFixed(2) ?? '0.00'}km 차이였어요.`;
    const podium = groupLiveStandings.slice(0, 3);

    return {
      title,
      summary,
      podium,
    };
  }, [currentGroupStanding, effectiveGroupParticipantCount, groupLiveStandings]);

  const trackedMatchResult = useMemo<RunMatchResult | undefined>(() => {
    if (matchMode === 'duel' && effectiveDuelOpponent && duelFinishSummary) {
      return {
        mode: 'duel',
        title: duelFinishSummary.title,
        summary: duelFinishSummary.summary,
        badgeLabel: duelFinishSummary.badgeLabel,
        opponentName: effectiveDuelOpponent.name,
        resultTone: duelFinishSummary.resultTone,
        gapKm: duelFinishSummary.gapKm,
        comparedDistanceKm: duelFinishSummary.opponentDistanceKm,
      };
    }

    if (matchMode === 'group' && groupFinishSummary && currentGroupStanding && effectiveGroupParticipantCount) {
      return {
        mode: 'group',
        title: groupFinishSummary.title,
        summary: groupFinishSummary.summary,
        badgeLabel: `${currentGroupStanding.rank}위`,
        rank: currentGroupStanding.rank,
        participantCount: effectiveGroupParticipantCount,
        gapKm: currentGroupStanding.gapAheadKm ?? undefined,
      };
    }

    return undefined;
  }, [
    currentGroupStanding,
    duelFinishSummary,
    effectiveDuelOpponent,
    effectiveGroupParticipantCount,
    groupFinishSummary,
    matchMode,
  ]);

  const estimatedMatchBonusPoints = useMemo(
    () => getEstimatedMatchBonusPoints(trackedMatchResult),
    [trackedMatchResult],
  );

  const duelResultRows = useMemo(() => {
    if (matchMode !== 'duel' || !effectiveDuelOpponent || !duelFinishSummary) {
      return [];
    }

    const meWon = duelFinishSummary.resultTone === 'win';
    const isDraw = duelFinishSummary.resultTone === 'draw';
    const opponentDistanceKm = duelFinishSummary.opponentDistanceKm;
    const opponentElapsedSeconds = effectiveDuelOpponent.liveElapsedSeconds ?? elapsedSeconds;
    const opponentPace = buildParticipantAveragePaceLabel(effectiveDuelOpponent, true);

    if (isDraw) {
      return [
        {
          id: 'me',
          resultLabel: 'DRAW',
          name: '나',
          paceLabel: currentUserArenaPace,
          durationLabel: formatDuration(elapsedSeconds),
          distanceKm,
          isCurrentUser: true,
        },
        {
          id: effectiveDuelOpponent.id,
          resultLabel: 'DRAW',
          name: effectiveDuelOpponent.name,
          paceLabel: opponentPace,
          durationLabel: formatDuration(opponentElapsedSeconds),
          distanceKm: opponentDistanceKm,
          isCurrentUser: false,
        },
      ];
    }

    return [
      {
        id: meWon ? 'me' : effectiveDuelOpponent.id,
        resultLabel: 'WIN',
        name: meWon ? '나' : effectiveDuelOpponent.name,
        paceLabel: meWon ? currentUserArenaPace : opponentPace,
        durationLabel: formatDuration(meWon ? elapsedSeconds : opponentElapsedSeconds),
        distanceKm: meWon ? distanceKm : opponentDistanceKm,
        isCurrentUser: meWon,
      },
      {
        id: meWon ? effectiveDuelOpponent.id : 'me',
        resultLabel: 'LOSER',
        name: meWon ? effectiveDuelOpponent.name : '나',
        paceLabel: meWon ? opponentPace : currentUserArenaPace,
        durationLabel: formatDuration(meWon ? opponentElapsedSeconds : elapsedSeconds),
        distanceKm: meWon ? opponentDistanceKm : distanceKm,
        isCurrentUser: !meWon,
      },
    ];
  }, [
    currentUserArenaPace,
    distanceKm,
    duelFinishSummary,
    elapsedSeconds,
    effectiveDuelOpponent,
    matchMode,
  ]);

  const groupResultRows = useMemo(
    () => groupLiveStandings.map((participant) => ({
      id: participant.id,
      rank: participant.rank,
      name: participant.isCurrentUser ? '나' : participant.name,
      paceLabel: participant.isCurrentUser
        ? currentUserArenaPace
        : buildParticipantAveragePaceLabel(participant, true),
      durationLabel: formatDuration(participant.liveElapsedSeconds ?? elapsedSeconds),
      distanceKm: participant.currentDistanceKm,
      isCurrentUser: participant.isCurrentUser,
      liveStatus: participant.liveStatus as RunningMatchLiveStatus | undefined,
    })),
    [currentUserArenaPace, elapsedSeconds, groupLiveStandings],
  );

  const groupResultStatusLabel = useMemo(() => {
    if (!groupResultRows.length) {
      return null;
    }

    const hasOngoingParticipants = groupResultRows.some((participant) => (
      !['finished', 'forfeited', 'disconnected'].includes(participant.liveStatus ?? '')
      && participant.distanceKm < Math.max(0, groupDistanceKm - 0.01)
    ));

    return hasOngoingParticipants
      ? '진행중 · 들어오는 대로 순위가 계속 업데이트돼요.'
      : '결과 확정 · 모든 참가자 기록이 정리됐어요.';
  }, [groupDistanceKm, groupResultRows]);

  return {
    duelFinishSummary,
    groupFinishSummary,
    trackedMatchResult,
    estimatedMatchBonusPoints,
    duelResultRows,
    groupResultRows,
    groupResultStatusLabel,
  };
}
