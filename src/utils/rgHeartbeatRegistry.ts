import { rgPerfMark } from '@/utils/rgPerfTrace';

type RgHeartbeatDetailValue = string | number | boolean | null | undefined;
type RgHeartbeatDetail = Record<string, RgHeartbeatDetailValue>;

type ActiveHeartbeatSlot = {
  detail?: RgHeartbeatDetail;
  key: string;
  label: string;
  ownerId: number;
};

let nextHeartbeatOwnerId = 0;
const activeHeartbeatSlots = new Map<string, ActiveHeartbeatSlot>();
const inFlightHeartbeatRequests = new Map<string, Promise<unknown>>();

export function acquireRgHeartbeatSlot(key: string, label: string, detail?: RgHeartbeatDetail) {
  const activeSlot = activeHeartbeatSlots.get(key);
  if (activeSlot) {
    rgPerfMark('heartbeat duplicate blocked', {
      activeOwnerId: activeSlot.ownerId,
      heartbeatKey: key,
      label,
      matchId: detail?.matchId,
    });

    return {
      acquired: false,
      ownerId: activeSlot.ownerId,
      release: () => {},
    };
  }

  nextHeartbeatOwnerId += 1;
  const ownerId = nextHeartbeatOwnerId;
  activeHeartbeatSlots.set(key, {
    detail,
    key,
    label,
    ownerId,
  });

  return {
    acquired: true,
    ownerId,
    release: () => {
      const currentSlot = activeHeartbeatSlots.get(key);
      if (currentSlot?.ownerId !== ownerId) {
        return;
      }

      activeHeartbeatSlots.delete(key);
    },
  };
}

export function runRgHeartbeatSingleFlight<T>(
  key: string,
  task: () => Promise<T>,
  detail?: RgHeartbeatDetail,
): { promise: Promise<T>; started: boolean } {
  const inFlightRequest = inFlightHeartbeatRequests.get(key) as Promise<T> | undefined;
  if (inFlightRequest) {
    rgPerfMark('heartbeat API duplicate blocked', {
      heartbeatKey: key,
      matchId: detail?.matchId,
    });

    return {
      promise: inFlightRequest,
      started: false,
    };
  }

  const promise = task().finally(() => {
    if (inFlightHeartbeatRequests.get(key) === promise) {
      inFlightHeartbeatRequests.delete(key);
    }
  });
  inFlightHeartbeatRequests.set(key, promise);

  return {
    promise,
    started: true,
  };
}

export function getActiveRgHeartbeatSlotCount() {
  return activeHeartbeatSlots.size;
}

export function getInFlightRgHeartbeatRequestCount() {
  return inFlightHeartbeatRequests.size;
}

export function canUseRgHeartbeatSlot(key: string, ownerId?: number) {
  const activeSlot = activeHeartbeatSlots.get(key);
  return !activeSlot || activeSlot.ownerId === ownerId;
}
