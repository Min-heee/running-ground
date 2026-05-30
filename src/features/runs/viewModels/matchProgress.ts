import type {
  DuelMatchOpponent,
  GroupMatchParticipant,
} from '@/lib/api/types';
import type {
  DuelComparisonSnapshot,
  GroupLiveStanding,
  LastSyncedMatchProgress,
  MatchProgressModel,
  MatchProgressParticipant,
  OfficialMatchProgress,
  ParticipantAveragePaceInput,
  RawMatchProgress,
} from '@/features/runs/types/matchProgress';
import { buildAveragePace } from '@/features/runs/tracking';
import {
  appendGroupLiveStandingGaps,
  sortEstimatedGroupLiveStandings,
  sortOfficialGroupLiveStandings,
} from '@/features/runs/viewModels/matchProgressRanking';

const MATCH_COMPARISON_INTERVAL_SECONDS = 30;

export type {
  DisplayMatchProgress,
  DuelComparisonSnapshot,
  GroupLiveStanding,
  LastSyncedMatchProgress,
  MatchProgressModel,
  OfficialMatchProgress,
  RawMatchProgress,
} from '@/features/runs/types/matchProgress';

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

function hasParticipantLiveProgress(participant: ParticipantAveragePaceInput | null | undefined) {
  return Boolean(
    typeof participant?.liveUpdatedAt === 'string' && participant.liveUpdatedAt.trim()
    || (typeof participant?.liveDistanceKm === 'number' && participant.liveDistanceKm > 0)
    || (typeof participant?.liveElapsedSeconds === 'number' && participant.liveElapsedSeconds > 0)
  );
}

function buildLiveParticipantPaceLabel(participant: ParticipantAveragePaceInput | null | undefined) {
  if (isMeasuredPaceLabel(participant?.officialAveragePace)) {
    return participant!.officialAveragePace!;
  }

  const liveDistanceKm = typeof participant?.liveDistanceKm === 'number' && Number.isFinite(participant.liveDistanceKm)
    ? Math.max(0, participant.liveDistanceKm)
    : 0;
  const liveElapsedSeconds = typeof participant?.liveElapsedSeconds === 'number' && Number.isFinite(participant.liveElapsedSeconds)
    ? Math.max(0, participant.liveElapsedSeconds)
    : 0;
  const liveAveragePaceLabel = buildAveragePace(liveDistanceKm, liveElapsedSeconds);

  if (isMeasuredPaceLabel(liveAveragePaceLabel)) {
    return liveAveragePaceLabel;
  }

  if (isMeasuredPaceLabel(participant?.livePace)) {
    return participant!.livePace!;
  }

  return hasParticipantLiveProgress(participant) ? '동기화 중' : '측정 대기';
}

export function buildParticipantAveragePaceLabel(
  participant: ParticipantAveragePaceInput | null | undefined,
  hasOfficialStart: boolean,
) {
  if (!hasOfficialStart) {
    return buildLiveParticipantPaceLabel(participant);
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

function resolvePaceLabel(...labels: (string | null | undefined)[]) {
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
    return sortOfficialGroupLiveStandings(
      participants.map((participant) => {
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
      }),
    );
  }

  const currentSeedRank = mySeedRank ?? 1;
  return appendGroupLiveStandingGaps(
    sortEstimatedGroupLiveStandings(
      participants.map((participant) => {
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
      }),
    ),
  );
}
