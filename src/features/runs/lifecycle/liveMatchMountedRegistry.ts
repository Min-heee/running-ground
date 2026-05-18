type LiveMatchMountedMode = 'duel' | 'group';

type LiveMatchMountedRegistryInput = {
  matchId?: string | null;
  mode: LiveMatchMountedMode;
  source?: string | null;
};

export type LiveMatchMountedRecord = {
  key: string;
  matchId: string;
  mode: LiveMatchMountedMode;
  mountedAtMs: number;
  source?: string | null;
};

const mountedMatches = new Map<string, LiveMatchMountedRecord>();
const mountedMatchListeners = new Set<(record: LiveMatchMountedRecord) => void>();

function notifyLiveMatchMounted(record: LiveMatchMountedRecord) {
  mountedMatchListeners.forEach((listener) => {
    listener(record);
  });
}

export function buildLiveMatchMountedRegistryKey({
  matchId,
  mode,
}: Pick<LiveMatchMountedRegistryInput, 'matchId' | 'mode'>) {
  if (!matchId) {
    return null;
  }
  return `${mode}:${matchId}`;
}

export function markLiveMatchMounted({
  matchId,
  mode,
  source = null,
}: LiveMatchMountedRegistryInput) {
  const key = buildLiveMatchMountedRegistryKey({ matchId, mode });
  if (!key || !matchId) {
    return {
      alreadyMounted: false,
      key,
      record: null,
    };
  }

  const existingRecord = mountedMatches.get(key);
  if (existingRecord) {
    return {
      alreadyMounted: true,
      key,
      record: existingRecord,
    };
  }

  const record: LiveMatchMountedRecord = {
    key,
    matchId,
    mode,
    mountedAtMs: Date.now(),
    source,
  };
  mountedMatches.set(key, record);
  notifyLiveMatchMounted(record);

  return {
    alreadyMounted: false,
    key,
    record,
  };
}

export function isLiveMatchMarkedMounted({
  matchId,
  mode,
}: Pick<LiveMatchMountedRegistryInput, 'matchId' | 'mode'>) {
  const key = buildLiveMatchMountedRegistryKey({ matchId, mode });
  return Boolean(key && mountedMatches.has(key));
}

export function getLatestLiveMatchMountedRecord(): LiveMatchMountedRecord | null {
  let latestRecord: LiveMatchMountedRecord | null = null;

  for (const record of mountedMatches.values()) {
    if (!latestRecord || record.mountedAtMs >= latestRecord.mountedAtMs) {
      latestRecord = record;
    }
  }

  return latestRecord;
}

export function resetLiveMatchMountedRegistryForTest() {
  mountedMatches.clear();
  mountedMatchListeners.clear();
}

export function subscribeLiveMatchMounted(
  listener: (record: LiveMatchMountedRecord) => void,
) {
  mountedMatchListeners.add(listener);

  return () => {
    mountedMatchListeners.delete(listener);
  };
}
