export type LeagueScoreInput = {
  totalDistanceKm: number;
  participants: number;
};

export type LeagueScore = {
  totalDistanceKm: number;
  participants: number;
  averageDistanceKm: number;
};

export type LeagueComparableScore = LeagueScore & {
  name?: string;
};

function safeNumber(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function calculateLeagueScore(input: LeagueScoreInput): LeagueScore {
  const totalDistanceKm = Number(safeNumber(input.totalDistanceKm).toFixed(1));
  const participants = Math.floor(safeNumber(input.participants));

  return {
    totalDistanceKm,
    participants,
    averageDistanceKm: Number((totalDistanceKm / Math.max(participants, 1)).toFixed(1)),
  };
}

export function compareLeagueScores(left: LeagueComparableScore, right: LeagueComparableScore) {
  if (right.averageDistanceKm !== left.averageDistanceKm) {
    return right.averageDistanceKm - left.averageDistanceKm;
  }

  if (right.totalDistanceKm !== left.totalDistanceKm) {
    return right.totalDistanceKm - left.totalDistanceKm;
  }

  if (right.participants !== left.participants) {
    return right.participants - left.participants;
  }

  return String(left.name ?? '').localeCompare(String(right.name ?? ''), 'ko');
}
