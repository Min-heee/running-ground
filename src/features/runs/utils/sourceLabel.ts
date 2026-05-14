import { MyRunRecord } from '@/domain';

function normalizeSourceText(value?: string) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function getRunSourceLabel(run: Pick<MyRunRecord, 'source' | 'sourceType'>) {
  const normalizedSource = normalizeSourceText(run.source);

  if (normalizedSource === 'apple health' || normalizedSource === 'nike run club' || normalizedSource === 'nrc') {
    return 'NRC';
  }

  if (normalizedSource === 'mynb' || normalizedSource === 'my nb' || normalizedSource === 'new balance') {
    return 'MyNB';
  }

  if (run.sourceType === 'nrc') {
    return 'NRC';
  }

  if (run.sourceType === 'mynb') {
    return 'MyNB';
  }

  if (run.sourceType === 'runningground' || normalizedSource === 'runningground') {
    return 'RunningGround';
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
