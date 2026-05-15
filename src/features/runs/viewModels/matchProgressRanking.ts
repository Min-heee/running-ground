import type { GroupLiveStanding } from '@/features/runs/viewModels/matchProgress';

function parseRankingPaceSecondsPerKm(paceLabel: string) {
  const matched = String(paceLabel).trim().match(/^(\d{1,2}):(\d{2})\/km$/i);

  if (!matched) {
    return 5 * 60 + 30;
  }

  return Number(matched[1]) * 60 + Number(matched[2]);
}

export function sortOfficialGroupLiveStandings(standings: GroupLiveStanding[]) {
  return [...standings].sort((left, right) => {
    if (left.isForfeited !== right.isForfeited) {
      return left.isForfeited ? 1 : -1;
    }

    return left.rank - right.rank;
  });
}

export function sortEstimatedGroupLiveStandings(standings: GroupLiveStanding[]) {
  return [...standings].sort((left, right) => {
    if (left.isForfeited !== right.isForfeited) {
      return left.isForfeited ? 1 : -1;
    }

    if (right.currentDistanceKm !== left.currentDistanceKm) {
      return right.currentDistanceKm - left.currentDistanceKm;
    }

    return parseRankingPaceSecondsPerKm(left.averagePace) - parseRankingPaceSecondsPerKm(right.averagePace);
  });
}

export function appendGroupLiveStandingGaps(standings: GroupLiveStanding[]) {
  return standings.map((participant, index, array) => {
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
