import { rgPerfMark } from '@/utils/rgPerfTrace';
import {
  createKeyedSingleFlightRegistry,
  createKeyedSlotRegistry,
  type RgRegistryDetailValue,
} from '@/utils/rgKeyedRegistry';

type RgHeartbeatDetail = Record<string, RgRegistryDetailValue>;

const heartbeatSlotRegistry = createKeyedSlotRegistry<RgHeartbeatDetail>({
  onDuplicate: ({ activeSlot, detail, key, label }) => {
    rgPerfMark('heartbeat duplicate blocked', {
      activeOwnerId: activeSlot.ownerId,
      heartbeatKey: key,
      label,
      matchId: detail?.matchId,
    });
  },
});

const heartbeatSingleFlightRegistry = createKeyedSingleFlightRegistry<RgHeartbeatDetail>({
  onDuplicate: ({ detail, key }) => {
    rgPerfMark('heartbeat API duplicate blocked', {
      heartbeatKey: key,
      matchId: detail?.matchId,
    });
  },
});

export function acquireRgHeartbeatSlot(key: string, label: string, detail?: RgHeartbeatDetail) {
  return heartbeatSlotRegistry.acquire(key, label, detail);
}

export function runRgHeartbeatSingleFlight<T>(
  key: string,
  task: () => Promise<T>,
  detail?: RgHeartbeatDetail,
): { promise: Promise<T>; started: boolean } {
  return heartbeatSingleFlightRegistry.run(key, task, detail);
}

export function getActiveRgHeartbeatSlotCount() {
  return heartbeatSlotRegistry.getActiveCount();
}

export function getInFlightRgHeartbeatRequestCount() {
  return heartbeatSingleFlightRegistry.getInFlightCount();
}

export function canUseRgHeartbeatSlot(key: string, ownerId?: number) {
  const activeOwnerId = heartbeatSlotRegistry.getOwnerId(key);
  return activeOwnerId === null || activeOwnerId === ownerId;
}
