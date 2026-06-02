import type { MyRunRecord } from '@/domain';

export type RunKind = 'solo' | 'party' | 'match';

export function getRunKind(run: Pick<MyRunRecord, 'matchResult'>): RunKind {
  if (!run.matchResult) {
    return 'solo';
  }
  if (run.matchResult.source === 'party') {
    return 'party';
  }
  return 'match';
}

export function isMatchRecordRun(run: Pick<MyRunRecord, 'matchResult'>): boolean {
  return getRunKind(run) === 'match';
}
