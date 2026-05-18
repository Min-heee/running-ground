import { buildActiveRoomRegistryKey } from '@/features/runs/sync/registryKeys';
import type {
  ActiveRoomCheckSource,
  InFlightActiveRoomCheck,
  LastActiveRoomCheck,
} from '@/features/runs/sync/activeRoomCheckTypes';
import { createKeyedRequestRegistry } from '@/utils/rgKeyedRegistry';

const SUPPRESSED_LOG_INTERVAL_MS = 2_000;

let nextRequestSequence = 0;
let nextGeneration = 0;
const inFlightChecks = createKeyedRequestRegistry<InFlightActiveRoomCheck>();
const lastChecksBySource = new Map<ActiveRoomCheckSource, LastActiveRoomCheck>();
const suppressedLogTimes = new Map<string, number>();

export function createActiveRoomCheckRequestId(source: ActiveRoomCheckSource) {
  nextRequestSequence += 1;
  return `${source.replace(/[^a-z0-9]+/gi, '-')}-${nextRequestSequence}`;
}

export function createActiveRoomCheckGeneration() {
  nextGeneration += 1;
  return nextGeneration;
}

export function buildActiveRoomCheckRegistryKey(source: ActiveRoomCheckSource) {
  return buildActiveRoomRegistryKey('current-user', source);
}

export function getInFlightActiveRoomCheck(ownerKey: string) {
  return inFlightChecks.get(ownerKey);
}

export function startInFlightActiveRoomCheck(
  ownerKey: string,
  createCheck: () => InFlightActiveRoomCheck,
) {
  return inFlightChecks.start(ownerKey, createCheck).request;
}

export function cleanupInFlightActiveRoomCheck(ownerKey: string, requestId: string) {
  inFlightChecks.deleteIf(ownerKey, (activeCheck) => activeCheck.requestId === requestId);
}

export function getLastActiveRoomCheck(source: ActiveRoomCheckSource) {
  return lastChecksBySource.get(source) ?? null;
}

export function setLastActiveRoomCheck(source: ActiveRoomCheckSource, check: LastActiveRoomCheck) {
  lastChecksBySource.set(source, check);
}

export function shouldLogSuppressedActiveRoomCheckEvent(key: string, nowMs: number) {
  const lastLogAtMs = suppressedLogTimes.get(key) ?? 0;
  if (nowMs - lastLogAtMs < SUPPRESSED_LOG_INTERVAL_MS) {
    return false;
  }

  suppressedLogTimes.set(key, nowMs);
  return true;
}

export function resetActiveRoomCheckRegistryForTest() {
  nextRequestSequence = 0;
  nextGeneration = 0;
  inFlightChecks.clear();
  lastChecksBySource.clear();
  suppressedLogTimes.clear();
}
