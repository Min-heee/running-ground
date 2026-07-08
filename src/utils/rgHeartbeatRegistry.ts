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

// A healthy progress push settles in well under a second (the live-match request even
// aborts at 5s). Anything still in-flight after 12s is a stuck Android HTTP socket (#203
// "inflight 고착"): treat it as abandoned and start a fresh push so the heartbeat channel
// — which also carries the OTHER participants' live distances back via setGroupMatchStatus
// — unblocks within ~12s instead of dying for the rest of the run. 12s is long enough to
// never double-fire a merely-slow request and short enough to recover quickly.
const HEARTBEAT_MAX_INFLIGHT_AGE_MS = 12000;

const heartbeatSingleFlightRegistry = createKeyedSingleFlightRegistry<RgHeartbeatDetail>({
  maxInflightAgeMs: HEARTBEAT_MAX_INFLIGHT_AGE_MS,
  onDuplicate: ({ detail, key }) => {
    rgPerfMark('heartbeat API duplicate blocked', {
      heartbeatKey: key,
      matchId: detail?.matchId,
    });
  },
  onEvictStale: ({ ageMs, detail, key }) => {
    rgPerfMark('heartbeat API stale inflight evicted', {
      ageMs: Math.round(ageMs),
      heartbeatKey: key,
      matchId: detail?.matchId,
    });
  },
});

export function acquireRgHeartbeatSlot(key: string, label: string, detail?: RgHeartbeatDetail) {
  return heartbeatSlotRegistry.acquire(key, label, detail);
}

// Stale-owner eviction for the SLOT registry — force-frees the key regardless of who owns it.
// Only the heartbeat-slot steal path (a viable sender that has watched the module-wide
// push-activity stamp stay silent past the stall window) may call this; the evicted owner's own
// release() closure is ownerId-guarded inside the registry, so it becomes a safe no-op.
export function evictRgHeartbeatSlot(key: string, detail?: RgHeartbeatDetail) {
  const evictedOwnerId = heartbeatSlotRegistry.getOwnerId(key);
  const evicted = heartbeatSlotRegistry.evict(key);
  if (evicted) {
    rgPerfMark('heartbeat slot evicted stale owner', {
      evictedOwnerId,
      heartbeatKey: key,
      matchId: detail?.matchId,
    });
  }

  return evicted;
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

export function resetRgHeartbeatRegistryForTest() {
  heartbeatSlotRegistry.clearForTest();
  heartbeatSingleFlightRegistry.clearForTest();
}
