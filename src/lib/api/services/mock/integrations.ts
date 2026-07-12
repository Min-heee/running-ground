import type { RunSourceType } from '@/domain';

// Intentional copy of src/features/integrations/sourceCatalogQueries.ts (canonical):
// the api layer must not import from features.
export function isExclusiveIntegrationSourceType(sourceType: RunSourceType) {
  return sourceType !== 'manual' && sourceType !== 'runningground';
}
