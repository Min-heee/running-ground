import { MyRunRecord } from '@/domain/types';

function normalizeSourceText(value?: string) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function getRunSourceLabel(run: Pick<MyRunRecord, 'source' | 'sourceType'>) {
  const normalizedSource = normalizeSourceText(run.source);

  if (normalizedSource === 'apple health' || normalizedSource === 'nike run club' || normalizedSource === 'nrc') {
    return 'NRC';
  }

  if (run.sourceType === 'nrc') {
    return 'NRC';
  }

  if (run.sourceType === 'runnigapp' || normalizedSource === 'runnigapp') {
    return 'RUNNIGAPP';
  }

  if (run.sourceType === 'apple_health') {
    if (
      normalizedSource === 'apple health'
      || normalizedSource === 'nike run club'
      || normalizedSource === 'nrc'
    ) {
      return 'NRC';
    }
  }

  return run.source;
}
