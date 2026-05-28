import type { Href } from 'expo-router';

type BuildRunDetailRedirectInput = {
  runId: string;
  isTabMode: boolean;
  matchDistanceKm?: number | null;
  matchId?: string | null;
  matchMode?: 'duel' | 'group' | null;
  matchSlotStartAt?: string | null;
};

export function buildRunDetailRedirect({
  runId,
  isTabMode,
  matchDistanceKm = null,
  matchId = null,
  matchMode = null,
  matchSlotStartAt = null,
}: BuildRunDetailRedirectInput): Href {
  return {
    pathname: '/run-detail',
    params: {
      runId,
      origin: isTabMode ? 'running' : 'activity',
      ...(matchId ? { matchId } : {}),
      ...(matchMode ? { matchMode } : {}),
      ...(typeof matchDistanceKm === 'number' ? { matchDistanceKm: String(matchDistanceKm) } : {}),
      ...(matchSlotStartAt ? { matchSlotStartAt } : {}),
    },
  };
}
