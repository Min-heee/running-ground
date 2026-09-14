import type { MyRunRecord } from '@/domain';
import { getRunSourceLabel } from './sourceLabel';

export type RunKind = 'solo' | 'party' | 'match';

export function getRunKind(run: Pick<MyRunRecord, 'matchResult'>): RunKind {
  if (!run.matchResult) {
    return 'solo';
  }
  if (run.matchResult.source === 'official') {
    return 'match';
  }
  return 'party';
}

export function isMatchRecordRun(run: Pick<MyRunRecord, 'matchResult'>): boolean {
  return getRunKind(run) === 'match';
}

// 기록 행·필터가 같은 단어로 맞물리도록 하는 종류 라벨 (오너 2026-09-14).
// 혼자 뛴 러닝은 어디서 들어온 기록인지가 곧 종류다 — 우리 앱에서 뛴 건 '혼자',
// 연동해 온 건 그 출처 이름(NRC·MyNB…)을 그대로 쓴다.
export function getRunKindLabel(
  run: Pick<MyRunRecord, 'matchResult' | 'source' | 'sourceType'>,
): string {
  const kind = getRunKind(run);

  if (kind === 'match') {
    return '매칭';
  }

  if (kind === 'party') {
    return '파티런';
  }

  // getRunSourceLabel의 마지막 폴백은 run.source 원문이라 옛 기록에선 빈 값이 새어나온다.
  const sourceLabel = (getRunSourceLabel(run) ?? '').trim();
  return !sourceLabel || sourceLabel === 'RunningGround' ? '혼자' : sourceLabel;
}
