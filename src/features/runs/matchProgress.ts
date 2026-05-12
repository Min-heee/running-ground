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

type MatchProgressParticipant = {
  liveDistanceKm?: number;
  liveElapsedSeconds?: number;
  livePace?: string;
  liveUpdatedAt?: string;
  averagePace?: string;
  officialReady?: boolean;
  officialDistanceKm?: number;
  officialElapsedSeconds?: number;
  officialAveragePace?: string;
  officialRank?: number;
  officialGapAheadKm?: number | null;
  officialGapLeaderKm?: number;
  officialComparedAt?: string;
};

export type RawMatchProgress = {
  distanceKm: number;
  elapsedSeconds: number;
  paceLabel: string;
  updatedAt?: string;
  hasProgress: boolean;
};

export type OfficialMatchProgress = {
  distanceKm: number;
  elapsedSeconds: number;
  paceLabel: string;
  rank?: number;
  gapAheadKm?: number | null;
  gapLeaderKm?: number;
  comparedAt?: string;
  ready: boolean;
};

export type DisplayMatchProgress = {
  distanceKm: number;
  elapsedSeconds: number;
  paceLabel: string;
  source: 'official' | 'raw' | 'estimated' | 'empty';
  hasProgress: boolean;
};

export type MatchProgressModel = {
  rawProgress: RawMatchProgress;
  officialProgress: OfficialMatchProgress | null;
  displayProgress: DisplayMatchProgress;
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

  const progressModel = buildMatchProgressModel(participant, Infinity);
  if (!progressModel.displayProgress.hasProgress) {
    return '측정 대기';
  }

  if (isMeasuredPaceLabel(progressModel.displayProgress.paceLabel)) {
    return progressModel.displayProgress.paceLabel;
  }

  if (isMeasuredPaceLabel(participant?.livePace)) {
    return participant!.livePace!;
  }

  return progressModel.displayProgress.paceLabel || '측정 대기';
}

function clampDistanceKm(distanceKm: number, targetDistanceKm: number) {
  const safeTargetDistanceKm = Number.isFinite(targetDistanceKm)
    ? Math.max(0, targetDistanceKm)
    : Number.POSITIVE_INFINITY;

  return Number(Math.min(safeTargetDistanceKm, Math.max(0, distanceKm)).toFixed(2));
}

function resolveElapsedSeconds(value?: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

function resolvePaceLabel(...labels: Array<string | null | undefined>) {
  return labels.find((label) => isMeasuredPaceLabel(label)) ?? '--:--/km';
}

export function buildRawMatchProgress(
  participant: MatchProgressParticipant | null | undefined,
  targetDistanceKm: number,
): RawMatchProgress {
  const liveDistanceKm = typeof participant?.liveDistanceKm === 'number' && Number.isFinite(participant.liveDistanceKm)
    ? clampDistanceKm(participant.liveDistanceKm, targetDistanceKm)
    : 0;
  const elapsedSeconds = resolveElapsedSeconds(participant?.liveElapsedSeconds);
  const paceLabel = resolvePaceLabel(
    buildAveragePace(liveDistanceKm, elapsedSeconds),
    participant?.livePace,
  );
  const hasProgress = Boolean(
    liveDistanceKm > 0
    || elapsedSeconds > 0
    || (typeof participant?.liveUpdatedAt === 'string' && participant.liveUpdatedAt.trim()),
  );

  return {
    distanceKm: liveDistanceKm,
    elapsedSeconds,
    paceLabel,
    updatedAt: participant?.liveUpdatedAt,
    hasProgress,
  };
}

export function buildOfficialMatchProgress(
  participant: MatchProgressParticipant | null | undefined,
  targetDistanceKm: number,
): OfficialMatchProgress | null {
  if (!participant?.officialReady || typeof participant.officialDistanceKm !== 'number') {
    return null;
  }

  const distanceKm = clampDistanceKm(participant.officialDistanceKm, targetDistanceKm);
  const elapsedSeconds = resolveElapsedSeconds(participant.officialElapsedSeconds);

  return {
    distanceKm,
    elapsedSeconds,
    paceLabel: resolvePaceLabel(
      participant.officialAveragePace,
      buildAveragePace(distanceKm, elapsedSeconds),
    ),
    rank: participant.officialRank,
    gapAheadKm: participant.officialGapAheadKm,
    gapLeaderKm: participant.officialGapLeaderKm,
    comparedAt: participant.officialComparedAt,
    ready: true,
  };
}

export function buildMatchProgressModel(
  participant: MatchProgressParticipant | null | undefined,
  targetDistanceKm: number,
): MatchProgressModel {
  const rawProgress = buildRawMatchProgress(participant, targetDistanceKm);
  const officialProgress = buildOfficialMatchProgress(participant, targetDistanceKm);

  if (officialProgress) {
    return {
      rawProgress,
      officialProgress,
      displayProgress: {
        distanceKm: officialProgress.distanceKm,
        elapsedSeconds: officialProgress.elapsedSeconds,
        paceLabel: officialProgress.paceLabel,
        source: 'official',
        hasProgress: true,
      },
    };
  }

  if (rawProgress.distanceKm > 0) {
    return {
      rawProgress,
      officialProgress,
      displayProgress: {
        distanceKm: rawProgress.distanceKm,
        elapsedSeconds: rawProgress.elapsedSeconds,
        paceLabel: rawProgress.paceLabel,
        source: 'raw',
        hasProgress: true,
      },
    };
  }

  const elapsedSeconds = rawProgress.elapsedSeconds;
  const paceLabel = [
    participant?.officialAveragePace,
    participant?.livePace,
    participant?.averagePace,
  ].find((label) => isMeasuredPaceLabel(label));

  if (!elapsedSeconds || !paceLabel) {
    return {
      rawProgress,
      officialProgress,
      displayProgress: {
        distanceKm: rawProgress.distanceKm,
        elapsedSeconds: rawProgress.elapsedSeconds,
        paceLabel: rawProgress.paceLabel,
        source: 'empty',
        hasProgress: rawProgress.hasProgress,
      },
    };
  }

  const paceSecondsPerKm = parsePaceSecondsPerKm(paceLabel);
  const estimatedDistanceKm = clampDistanceKm(elapsedSeconds / Math.max(1, paceSecondsPerKm), targetDistanceKm);

  return {
    rawProgress,
    officialProgress,
    displayProgress: {
      distanceKm: estimatedDistanceKm,
      elapsedSeconds,
      paceLabel,
      source: 'estimated',
      hasProgress: true,
    },
  };
}

export function resolveParticipantDisplayDistanceKm(
  participant: MatchProgressParticipant | null | undefined,
  targetDistanceKm: number,
) {
  return buildMatchProgressModel(participant, targetDistanceKm).displayProgress.distanceKm;
}

export function formatArenaPaceChip(label: string, paceLabel: string) {
  return `${label} ${paceLabel || '측정 대기'}`;
}

export function hasRemoteRunnerProgress(
  participant?: MatchProgressParticipant | null,
) {
  return buildMatchProgressModel(participant, Infinity).displayProgress.hasProgress;
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
        const progressModel = buildMatchProgressModel(participant, targetDistanceKm);
        const officialProgress = progressModel.officialProgress;
        return {
          ...participant,
          currentDistanceKm: officialProgress?.distanceKm ?? 0,
          isForfeited: participant.liveStatus === 'forfeited',
          rank: officialProgress?.rank ?? participants.length,
          gapAheadKm: officialProgress?.gapAheadKm ?? null,
          gapLeaderKm: officialProgress?.gapLeaderKm ?? 0,
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
      const progressModel = buildMatchProgressModel(participant, targetDistanceKm);
      const estimatedDistanceKm = isCurrentUser
        ? currentDistanceKm
        : progressModel.displayProgress.hasProgress
          ? progressModel.displayProgress.distanceKm
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
