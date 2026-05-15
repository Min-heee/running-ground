import { rgPerfMark } from '@/utils/rgPerfTrace';
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

export function getActiveRgPollingSlotCount() {
  return pollingSlotRegistry.getActiveCount();
}
