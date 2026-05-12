import type { RunSourceType } from '@/domain/types';

export function isExclusiveIntegrationSourceType(sourceType: RunSourceType) {
  return sourceType !== 'manual' && sourceType !== 'runningground';
}
