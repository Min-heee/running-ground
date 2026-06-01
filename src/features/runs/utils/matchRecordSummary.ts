import type { MyRunRecord } from '@/domain';

export type MatchRecordSummary = {
  totalCount: number;
  duelCount: number;
  groupCount: number;
};

export function buildMatchRecordSummary(
  runs: readonly MyRunRecord[] | null | undefined,
): MatchRecordSummary {
  if (!Array.isArray(runs)) {
    return { totalCount: 0, duelCount: 0, groupCount: 0 };
  }

  return runs.reduce<MatchRecordSummary>((summary, run) => {
    if (!run.matchResult) {
      return summary;
    }

    if (run.matchResult.mode === 'duel') {
      return {
        ...summary,
        duelCount: summary.duelCount + 1,
        totalCount: summary.totalCount + 1,
      };
    }

    if (run.matchResult.mode === 'group') {
      return {
        ...summary,
        groupCount: summary.groupCount + 1,
        totalCount: summary.totalCount + 1,
      };
    }

    return summary;
  }, { totalCount: 0, duelCount: 0, groupCount: 0 });
}
