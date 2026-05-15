export type RgRegistryDetailValue = string | number | boolean | null | undefined;
export type RgRegistryDetail = Record<string, RgRegistryDetailValue>;

type ActiveKeyedSlot<TDetail extends RgRegistryDetail> = {
  detail?: TDetail;
  key: string;
  label: string;
  ownerId: number;
  startedAtMs: number;
};

type KeyedSlotDuplicateContext<TDetail extends RgRegistryDetail> = {
  activeSlot: ActiveKeyedSlot<TDetail>;
  detail?: TDetail;
  key: string;
  label: string;
};

type CreateKeyedSlotRegistryOptions<TDetail extends RgRegistryDetail> = {
  onDuplicate?: (context: KeyedSlotDuplicateContext<TDetail>) => void;
};

type KeyedSingleFlightDuplicateContext<TDetail extends RgRegistryDetail> = {
  detail?: TDetail;
  key: string;
};

type CreateKeyedSingleFlightRegistryOptions<TDetail extends RgRegistryDetail> = {
  onDuplicate?: (context: KeyedSingleFlightDuplicateContext<TDetail>) => void;
};

function getNowMs() {
  return typeof globalThis.performance?.now === 'function' ? globalThis.performance.now() : Date.now();
}

export function createKeyedSlotRegistry<TDetail extends RgRegistryDetail = RgRegistryDetail>({
  onDuplicate,
}: CreateKeyedSlotRegistryOptions<TDetail> = {}) {
  let nextOwnerId = 0;
  const activeSlots = new Map<string, ActiveKeyedSlot<TDetail>>();

  return {
    acquire(key: string, label: string, detail?: TDetail) {
      const activeSlot = activeSlots.get(key);
      if (activeSlot) {
        onDuplicate?.({
          activeSlot,
          detail,
          key,
          label,
        });

        return {
          acquired: false,
          ownerId: activeSlot.ownerId,
          release: () => {},
        };
      }

      nextOwnerId += 1;
      const ownerId = nextOwnerId;
      activeSlots.set(key, {
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
          const currentSlot = activeSlots.get(key);
          if (currentSlot?.ownerId !== ownerId) {
            return;
          }

          activeSlots.delete(key);
        },
      };
    },
    clearForTest() {
      activeSlots.clear();
      nextOwnerId = 0;
    },
    getActiveCount() {
      return activeSlots.size;
    },
    getOwnerId(key: string) {
      return activeSlots.get(key)?.ownerId ?? null;
    },
  };
}

export function createKeyedSingleFlightRegistry<TDetail extends RgRegistryDetail = RgRegistryDetail>({
  onDuplicate,
}: CreateKeyedSingleFlightRegistryOptions<TDetail> = {}) {
  const inFlightRequests = new Map<string, Promise<unknown>>();

  return {
    clearForTest() {
      inFlightRequests.clear();
    },
    getInFlightCount() {
      return inFlightRequests.size;
    },
    run<T>(key: string, task: () => Promise<T>, detail?: TDetail): { promise: Promise<T>; started: boolean } {
      const inFlightRequest = inFlightRequests.get(key) as Promise<T> | undefined;
      if (inFlightRequest) {
        onDuplicate?.({
          detail,
          key,
        });

        return {
          promise: inFlightRequest,
          started: false,
        };
      }

      const promise = task().finally(() => {
        if (inFlightRequests.get(key) === promise) {
          inFlightRequests.delete(key);
        }
      });
      inFlightRequests.set(key, promise);

      return {
        promise,
        started: true,
      };
    },
  };
}

export function createKeyedValueRegistry<TValue>() {
  const values = new Map<string, TValue>();

  return {
    clear() {
      values.clear();
    },
    delete(key: string) {
      return values.delete(key);
    },
    deleteIf(key: string, predicate: (value: TValue) => boolean) {
      const currentValue = values.get(key);
      if (!currentValue || !predicate(currentValue)) {
        return false;
      }

      values.delete(key);
      return true;
    },
    get(key: string) {
      return values.get(key);
    },
    set(key: string, value: TValue) {
      values.set(key, value);
    },
    size() {
      return values.size;
    },
  };
}
