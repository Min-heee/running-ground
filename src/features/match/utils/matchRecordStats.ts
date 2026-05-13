import type { MyActivityResponse } from '@/lib/api/types';

export type MatchRecordRun = MyActivityResponse['runs'][number];

export function buildMatchRecordStats(activity: MyActivityResponse | null) {
  const matchRuns = (activity?.runs ?? []).filter((run) => run.matchResult);
  const duelRuns = matchRuns.filter((run) => run.matchResult?.mode === 'duel');
  const groupRuns = matchRuns.filter((run) => run.matchResult?.mode === 'group');
  const duelWins = duelRuns.filter((run) => run.matchResult?.resultTone === 'win').length;
  const duelLosses = duelRuns.filter((run) => run.matchResult?.resultTone === 'lose').length;
  const duelDraws = duelRuns.filter((run) => run.matchResult?.resultTone === 'draw').length;
  const groupPodiumCount = groupRuns.filter((run) => {
    const rank = run.matchResult?.rank;
    return typeof rank === 'number' && rank <= 3;
  }).length;

  return {
    duelDraws,
    duelLosses,
    duelRuns,
    duelWins,
    groupPodiumCount,
    groupRuns,
    matchRuns,
  };
}
