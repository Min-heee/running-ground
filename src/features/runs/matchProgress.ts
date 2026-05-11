import type {
  DuelMatchOpponent,
  GroupMatchParticipant,
} from '@/lib/api/types';
import { buildAveragePace } from '@/features/runs/tracking';

const MATCH_COMPARISON_INTERVAL_SECONDS = 30;

export type GroupLiveStanding = GroupMatchParticipant & {
  rank: number;
  currentDistanceKm: number;
  gapAheadKm: number | null;
  gapLeaderKm: number;
  isForfeited: boolean;
  isCurrentUser: boolean;
};

export type LastSyncedMatchProgress = {
  matchId: string;
  distanceKm: number;
  elapsedSeconds: number;
  currentPace: string;
  updatedAt: number;
};

export type DuelComparisonSnapshot = {
  checkpointSeconds: number;
  currentDistanceKm: number;
  opponentDistanceKm: number;
  gapKm: number;
};

export function parsePaceSecondsPerKm(paceLabel: string) {
  const matched = String(paceLabel).trim().match(/^(\d{1,2}):(\d{2})\/km$/i);

  if (!matched) {
    return 5 * 60 + 30;
  }

  return Number(matched[1]) * 60 + Number(matched[2]);
}

export function normalizeMatchProgressPace(paceLabel: string, fallbackPaceLabel?: string) {
  const matched = String(paceLabel).trim().match(/^\d{1,2}:\d{2}\/km$/i);

  if (matched) {
    return paceLabel;
  }

  const fallbackMatched = String(fallbackPaceLabel ?? '').trim().match(/^\d{1,2}:\d{2}\/km$/i);
  if (fallbackMatched) {
    return fallbackPaceLabel!;
  }

  return '--:--/km';
}

export function isMeasuredPaceLabel(paceLabel?: string | null) {
  return /^\d{1,2}:\d{2}\/km$/i.test(String(paceLabel ?? '').trim());
}

export function buildAverageArenaPaceLabel(distanceKm: number, elapsedSeconds: number, hasOfficialStart: boolean) {
  if (!hasOfficialStart) {
    return '';
  }

  const averagePaceLabel = buildAveragePace(distanceKm, elapsedSeconds);
  return isMeasuredPaceLabel(averagePaceLabel) ? averagePaceLabel : '평균 계산 중';
}

export function buildParticipantAveragePaceLabel(
  participant: Pick<DuelMatchOpponent, 'liveDistanceKm' | 'liveElapsedSeconds' | 'livePace' | 'liveUpdatedAt' | 'officialAveragePace'> | null | undefined,
  hasOfficialStart: boolean,
) {
  if (!hasOfficialStart) {
    return '';
  }

  if (isMeasuredPaceLabel(participant?.officialAveragePace)) {
    return participant!.officialAveragePace!;
  }

  if (!hasRemoteRunnerProgress(participant)) {
    return '측정 대기';
  }

  const averagePaceLabel = buildAverageArenaPaceLabel(participant?.liveDistanceKm ?? 0, participant?.liveElapsedSeconds ?? 0, true);
  if (isMeasuredPaceLabel(averagePaceLabel)) {
    return averagePaceLabel;
  }

  if (isMeasuredPaceLabel(participant?.livePace)) {
    return participant!.livePace!;
  }

  return averagePaceLabel || '측정 대기';
}

export function resolveParticipantDisplayDistanceKm(
  participant: {
    liveDistanceKm?: number;
    liveElapsedSeconds?: number;
    livePace?: string;
    averagePace?: string;
    officialAveragePace?: string;
  } | null | undefined,
  targetDistanceKm: number,
) {
  const safeTargetDistanceKm = Math.max(0, targetDistanceKm);
  const liveDistanceKm = typeof participant?.liveDistanceKm === 'number' && Number.isFinite(participant.liveDistanceKm)
    ? Math.max(0, participant.liveDistanceKm)
    : 0;

  if (liveDistanceKm > 0) {
    return Number(Math.min(safeTargetDistanceKm, liveDistanceKm).toFixed(2));
  }

  const elapsedSeconds = typeof participant?.liveElapsedSeconds === 'number' && Number.isFinite(participant.liveElapsedSeconds)
    ? Math.max(0, participant.liveElapsedSeconds)
    : 0;
  const paceLabel = [
    participant?.officialAveragePace,
    participant?.livePace,
    participant?.averagePace,
  ].find((label) => isMeasuredPaceLabel(label));

  if (!elapsedSeconds || !paceLabel) {
    return Number(Math.min(safeTargetDistanceKm, liveDistanceKm).toFixed(2));
  }

  const paceSecondsPerKm = parsePaceSecondsPerKm(paceLabel);
  const estimatedDistanceKm = elapsedSeconds / Math.max(1, paceSecondsPerKm);
  return Number(Math.min(safeTargetDistanceKm, Math.max(0, estimatedDistanceKm)).toFixed(2));
}

export function formatArenaPaceChip(label: string, paceLabel: string) {
  return `${label} ${paceLabel || '측정 대기'}`;
}

export function hasRemoteRunnerProgress(
  participant?: Pick<DuelMatchOpponent, 'liveDistanceKm' | 'liveUpdatedAt'> | Pick<GroupMatchParticipant, 'liveDistanceKm' | 'liveUpdatedAt'> | null,
) {
  if (!participant) {
    return false;
  }

  if (typeof participant.liveUpdatedAt === 'string' && participant.liveUpdatedAt.trim()) {
    return true;
  }

  return typeof participant.liveDistanceKm === 'number' && participant.liveDistanceKm > 0;
}

function projectDistanceAtElapsed(distanceKm: number, elapsedSeconds: number, targetElapsedSeconds: number) {
  if (!Number.isFinite(distanceKm) || !Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) {
    return 0;
  }

  const safeTargetElapsedSeconds = Math.max(0, Math.min(targetElapsedSeconds, elapsedSeconds));
  return Number(((distanceKm * safeTargetElapsedSeconds) / elapsedSeconds).toFixed(2));
}

export function buildDuelComparisonSnapshot(
  currentProgress: LastSyncedMatchProgress | null,
  opponent: DuelMatchOpponent | null,
  targetDistanceKm: number,
): DuelComparisonSnapshot | null {
  if (
    !currentProgress
    || !opponent
    || !hasRemoteRunnerProgress(opponent)
    || typeof opponent.liveElapsedSeconds !== 'number'
  ) {
    return null;
  }

  const commonElapsedSeconds = Math.min(currentProgress.elapsedSeconds, opponent.liveElapsedSeconds);
  const checkpointSeconds = Math.floor(commonElapsedSeconds / MATCH_COMPARISON_INTERVAL_SECONDS) * MATCH_COMPARISON_INTERVAL_SECONDS;
  if (checkpointSeconds < MATCH_COMPARISON_INTERVAL_SECONDS) {
    return null;
  }

  const currentDistanceKm = projectDistanceAtElapsed(
    currentProgress.distanceKm,
    currentProgress.elapsedSeconds,
    checkpointSeconds,
  );
  const opponentDistanceKm = projectDistanceAtElapsed(
    resolveParticipantDisplayDistanceKm(opponent, targetDistanceKm),
    opponent.liveElapsedSeconds,
    checkpointSeconds,
  );

  return {
    checkpointSeconds,
    currentDistanceKm,
    opponentDistanceKm,
    gapKm: Number((currentDistanceKm - opponentDistanceKm).toFixed(2)),
  };
}

export function buildDistanceGapLabel(gapKm: number | null) {
  if (gapKm === null) {
    return '서버 공식 판정 준비 중';
  }

  const absoluteGapKm = Math.abs(gapKm);
  if (absoluteGapKm < 0.005) {
    return '거리차 0.00km';
  }

  return gapKm >= 0
    ? `${absoluteGapKm.toFixed(2)}km 앞섬`
    : `${absoluteGapKm.toFixed(2)}km 뒤짐`;
}

function buildSeedRankPaceAdjustment(seedRank: number) {
  return 1 - Math.max(-0.08, Math.min(0.08, (6 - seedRank) * 0.012));
}

export function buildEstimatedCompetitiveDistanceKm(paceLabel: string, elapsedSeconds: number, seedRank?: number) {
  if (elapsedSeconds <= 0) {
    return 0;
  }

  const paceSecondsPerKm = parsePaceSecondsPerKm(paceLabel);
  const paceAdjustment = typeof seedRank === 'number' ? buildSeedRankPaceAdjustment(seedRank) : 1;
  const estimatedDistanceKm = elapsedSeconds / Math.max(1, paceSecondsPerKm * paceAdjustment);

  return Number(Math.max(0, estimatedDistanceKm).toFixed(2));
}

export function buildGroupLiveStandings(
  participants: GroupMatchParticipant[],
  mySeedRank: number | undefined,
  currentDistanceKm: number,
  elapsedSeconds: number,
  targetDistanceKm: number,
): GroupLiveStanding[] {
  if (!participants.length) {
    return [];
  }

  if (participants.some((participant) => participant.officialReady && typeof participant.officialRank === 'number')) {
    return participants
      .map((participant) => {
        const isCurrentUser = participant.seedRank === (mySeedRank ?? 1);
        return {
          ...participant,
          currentDistanceKm: participant.officialReady ? participant.officialDistanceKm ?? 0 : 0,
          isForfeited: participant.liveStatus === 'forfeited',
          rank: participant.officialRank ?? participants.length,
          gapAheadKm: participant.officialReady ? participant.officialGapAheadKm ?? null : null,
          gapLeaderKm: participant.officialReady ? participant.officialGapLeaderKm ?? 0 : 0,
          isCurrentUser,
        };
      })
      .sort((left, right) => {
        if (left.isForfeited !== right.isForfeited) {
          return left.isForfeited ? 1 : -1;
        }

        return left.rank - right.rank;
      });
  }

  const currentSeedRank = mySeedRank ?? 1;
  return participants
    .map((participant) => {
      const isCurrentUser = participant.seedRank === currentSeedRank;
      const isForfeited = participant.liveStatus === 'forfeited';
      const hasParticipantProgress = hasRemoteRunnerProgress(participant);
      const estimatedDistanceKm = isCurrentUser
        ? currentDistanceKm
        : hasParticipantProgress
          ? resolveParticipantDisplayDistanceKm(participant, targetDistanceKm)
          : 0;

      return {
        ...participant,
        currentDistanceKm: estimatedDistanceKm,
        isForfeited,
        rank: 0,
        gapAheadKm: null,
        gapLeaderKm: 0,
        isCurrentUser,
      };
    })
    .sort((left, right) => {
      if (left.isForfeited !== right.isForfeited) {
        return left.isForfeited ? 1 : -1;
      }

      if (right.currentDistanceKm !== left.currentDistanceKm) {
        return right.currentDistanceKm - left.currentDistanceKm;
      }

      return parsePaceSecondsPerKm(left.averagePace) - parsePaceSecondsPerKm(right.averagePace);
    })
    .map((participant, index, array) => {
      const leaderDistance = array[0]?.currentDistanceKm ?? participant.currentDistanceKm;
      const aheadRunner = index > 0 ? array[index - 1] : null;

      return {
        ...participant,
        rank: index + 1,
        gapLeaderKm: Number(Math.max(0, leaderDistance - participant.currentDistanceKm).toFixed(2)),
        gapAheadKm: aheadRunner ? Number(Math.max(0, aheadRunner.currentDistanceKm - participant.currentDistanceKm).toFixed(2)) : null,
      };
    });
}
