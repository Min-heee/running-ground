import type { GroupLiveStanding } from '@/features/runs/viewModels/matchProgress';

function parseRankingPaceSecondsPerKm(paceLabel: string) {
  const matched = String(paceLabel).trim().match(/^(\d{1,2}):(\d{2})\/km$/i);

  if (!matched) {
    return 5 * 60 + 30;
  }

  return Number(matched[1]) * 60 + Number(matched[2]);
}

// Two forfeiters must never tie ("공동 N등"): order by distance covered desc, then by
// forfeit time desc (whoever forfeited LATER ranks better). Returns null when not both
// forfeited so callers fall through to their normal tiebreak.
function compareForfeitersByDistanceThenForfeitTime(left: GroupLiveStanding, right: GroupLiveStanding) {
  if (!left.isForfeited || !right.isForfeited) {
    return null;
  }
  if (right.currentDistanceKm !== left.currentDistanceKm) {
    return right.currentDistanceKm - left.currentDistanceKm;
  }
  return (Date.parse(right.forfeitedAt ?? '') || 0) - (Date.parse(left.forfeitedAt ?? '') || 0);
}

export function sortOfficialGroupLiveStandings(standings: GroupLiveStanding[]) {
  return [...standings].sort((left, right) => {
    if (left.isForfeited !== right.isForfeited) {
      return left.isForfeited ? 1 : -1;
    }

    const forfeitOrder = compareForfeitersByDistanceThenForfeitTime(left, right);
    if (forfeitOrder !== null && forfeitOrder !== 0) {
      return forfeitOrder;
    }

    return left.rank - right.rank;
  });
}

export function sortEstimatedGroupLiveStandings(standings: GroupLiveStanding[]) {
  return [...standings].sort((left, right) => {
    if (left.isForfeited !== right.isForfeited) {
      return left.isForfeited ? 1 : -1;
    }

    const forfeitOrder = compareForfeitersByDistanceThenForfeitTime(left, right);
    if (forfeitOrder !== null && forfeitOrder !== 0) {
      return forfeitOrder;
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
