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

type KeyedSingleFlightEvictionContext<TDetail extends RgRegistryDetail> = {
  ageMs: number;
  detail?: TDetail;
  key: string;
};

type CreateKeyedSingleFlightRegistryOptions<TDetail extends RgRegistryDetail> = {
  onDuplicate?: (context: KeyedSingleFlightDuplicateContext<TDetail>) => void;
  // When a request for a key has been in-flight longer than this many ms, it is
  // treated as stuck/abandoned (e.g. an Android HTTP socket that never settles) and a
  // FRESH request is started instead of returning the hung promise. Defaults to
  // Infinity (the original behavior: an in-flight entry always blocks duplicates),
  // so only callers that opt in (the heartbeat registry) change behavior.
  onEvictStale?: (context: KeyedSingleFlightEvictionContext<TDetail>) => void;
  maxInflightAgeMs?: number;
};

type InFlightSingleFlightEntry = {
  promise: Promise<unknown>;
  startedAtMs: number;
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
  onEvictStale,
  maxInflightAgeMs = Infinity,
}: CreateKeyedSingleFlightRegistryOptions<TDetail> = {}) {
  const inFlightRequests = new Map<string, InFlightSingleFlightEntry>();

  return {
    clearForTest() {
      inFlightRequests.clear();
    },
    getInFlightCount() {
      return inFlightRequests.size;
    },
    run<T>(key: string, task: () => Promise<T>, detail?: TDetail): { promise: Promise<T>; started: boolean } {
      const existingEntry = inFlightRequests.get(key);
      if (existingEntry) {
        const ageMs = getNowMs() - existingEntry.startedAtMs;
        if (ageMs < maxInflightAgeMs) {
          // Genuine in-flight duplicate — coalesce onto the existing request.
          onDuplicate?.({
            detail,
            key,
          });

          return {
            promise: existingEntry.promise as Promise<T>,
            started: false,
          };
        }

        // The existing request has outlived maxInflightAgeMs: it is stuck/abandoned
        // (e.g. an Android HTTP socket that never settles). Drop it from the registry and
        // fall through to start a FRESH request so the channel unblocks. The stale
        // promise's own `.finally` cleanup is identity-guarded below, so when (if ever) it
        // finally settles it will NOT delete the newer entry we are about to install.
        onEvictStale?.({
          ageMs,
          detail,
          key,
        });
        inFlightRequests.delete(key);
      }

      const entry: InFlightSingleFlightEntry = {
        promise: undefined as unknown as Promise<unknown>,
        startedAtMs: getNowMs(),
      };
      const promise = task().finally(() => {
        // Identity guard: only clear the map slot if it still holds THIS entry. A stale
        // entry that was evicted (and replaced by a newer request) must not delete the
        // newer one when its abandoned promise eventually settles.
        if (inFlightRequests.get(key) === entry) {
          inFlightRequests.delete(key);
        }
      });
      entry.promise = promise;
      inFlightRequests.set(key, entry);

      return {
        promise,
        started: true,
      };
    },
  };
}

export function createKeyedRequestRegistry<TRequest>() {
  const activeRequests = new Map<string, TRequest>();

  return {
    clear() {
      activeRequests.clear();
    },
    deleteIf(key: string, predicate: (value: TRequest) => boolean) {
      const currentRequest = activeRequests.get(key);
      if (!currentRequest || !predicate(currentRequest)) {
        return false;
      }

      activeRequests.delete(key);
      return true;
    },
    get(key: string) {
      return activeRequests.get(key);
    },
    getActiveCount() {
      return activeRequests.size;
    },
    start(key: string, createRequest: () => TRequest): { request: TRequest; started: boolean } {
      const activeRequest = activeRequests.get(key);
      if (activeRequest) {
        return {
          request: activeRequest,
          started: false,
        };
      }

      const request = createRequest();
      activeRequests.set(key, request);
      return {
        request,
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
