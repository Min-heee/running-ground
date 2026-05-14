import { rgPerfMark } from '@/utils/rgPerfTrace';

type RgPollingDetailValue = string | number | boolean | null | undefined;
type RgPollingDetail = Record<string, RgPollingDetailValue>;

type ActivePollingSlot = {
  detail?: RgPollingDetail;
  key: string;
  label: string;
  ownerId: number;
  startedAtMs: number;
};

let nextPollingOwnerId = 0;
const activePollingSlots = new Map<string, ActivePollingSlot>();

function getNowMs() {
  return typeof globalThis.performance?.now === 'function' ? globalThis.performance.now() : Date.now();
}

export function acquireRgPollingSlot(key: string, label: string, detail?: RgPollingDetail) {
  const activeSlot = activePollingSlots.get(key);
  if (activeSlot) {
    rgPerfMark('polling duplicate blocked', {
      activeOwnerId: activeSlot.ownerId,
      label,
      pollingKey: key,
      source: detail?.source,
    });

    return {
      acquired: false,
      ownerId: activeSlot.ownerId,
      release: () => {},
    };
  }

  nextPollingOwnerId += 1;
  const ownerId = nextPollingOwnerId;
  activePollingSlots.set(key, {
    detail,
    key,
    label,
    ownerId,
    startedAtMs: getNowMs(),
  });

  return {
    acquired: true,
    ownerId,
    release: () => {
      const currentSlot = activePollingSlots.get(key);
      if (currentSlot?.ownerId !== ownerId) {
        return;
      }

      activePollingSlots.delete(key);
    },
  };
}

export function getActiveRgPollingSlotCount() {
  return activePollingSlots.size;
}
