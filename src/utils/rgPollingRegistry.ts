import { rgPerfMark, rgPerfTrackResource } from '@/utils/rgPerfTrace';
import {
  createKeyedSlotRegistry,
  type RgRegistryDetailValue,
} from '@/utils/rgKeyedRegistry';

type RgPollingDetail = Record<string, RgRegistryDetailValue>;

const pollingSlotRegistry = createKeyedSlotRegistry<RgPollingDetail>({
  onDuplicate: ({ activeSlot, detail, key, label }) => {
    rgPerfMark('polling duplicate blocked', {
      activeOwnerId: activeSlot.ownerId,
      label,
      pollingKey: key,
      source: detail?.source,
    });
  },
});

export function acquireRgPollingSlot(key: string, label: string, detail?: RgPollingDetail) {
  return pollingSlotRegistry.acquire(key, label, detail);
}

export function startRgPollingInterval({
  detail,
  intervalMs,
  key,
  label,
  onTick,
}: {
  detail?: RgPollingDetail;
  intervalMs: number;
  key: string;
  label: string;
  onTick: () => unknown | Promise<unknown>;
}) {
  const pollingSlot = acquireRgPollingSlot(key, label, {
    ...detail,
    intervalMs,
  });

  if (!pollingSlot.acquired) {
    return {
      acquired: false,
      ownerId: pollingSlot.ownerId,
      stop: pollingSlot.release,
    };
  }

  const stopPollingTrace = rgPerfTrackResource('polling', label, {
    ...detail,
    intervalMs,
    pollingKey: key,
  });
  const timer = setInterval(() => {
    void Promise.resolve(onTick()).catch(() => {});
  }, intervalMs);

  return {
    acquired: true,
    ownerId: pollingSlot.ownerId,
    stop: () => {
      clearInterval(timer);
      stopPollingTrace();
      pollingSlot.release();
    },
  };
}

export function getActiveRgPollingSlotCount() {
  return pollingSlotRegistry.getActiveCount();
}

export function resetRgPollingRegistryForTest() {
  pollingSlotRegistry.clearForTest();
}
