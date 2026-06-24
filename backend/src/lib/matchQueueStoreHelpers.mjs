import { MATCH_BOOKING_CUTOFF_MS } from './matchConstants.mjs';
import { normalizeMatchQueueDistance } from './matchPureHelpers.mjs';
import { getMatchQueueEntryExpiresAt } from './matchScheduleHelpers.mjs';
import { nextId } from './idHelpers.mjs';

export function ensureMatchQueues(store) {
  if (!store.matchQueues || typeof store.matchQueues !== 'object') {
    store.matchQueues = {
      duel: [],
      group: [],
    };
  }

  if (!Array.isArray(store.matchQueues.duel)) {
    store.matchQueues.duel = [];
  }

  if (!Array.isArray(store.matchQueues.group)) {
    store.matchQueues.group = [];
  }

  return store.matchQueues;
}

export function pruneMatchQueues(store, now = new Date()) {
  const queues = ensureMatchQueues(store);
  const nowMs = now.getTime();
  const activeUserIds = new Set(store.users.map((user) => user.id));

  for (const mode of ['duel', 'group']) {
    queues[mode] = queues[mode].filter((entry) => {
      if (!entry || !activeUserIds.has(entry.userId)) {
        return false;
      }

      const requestedAtMs = new Date(entry.requestedAt).getTime();
      const slotStartAtMs = new Date(entry.slotStartAt).getTime();
      const expiresAtMs = new Date(getMatchQueueEntryExpiresAt(entry)).getTime();

      if (!Number.isFinite(requestedAtMs) || !Number.isFinite(slotStartAtMs) || !Number.isFinite(expiresAtMs)) {
        return false;
      }

      if (requestedAtMs > nowMs) {
        return false;
      }

      if (entry.testMode) {
        return expiresAtMs > nowMs;
      }

      return slotStartAtMs - MATCH_BOOKING_CUTOFF_MS > nowMs;
    });
  }

  return queues;
}

export function upsertMatchQueueEntry(store, mode, userId, distanceKm, slotStartAt, options = {}) {
  const queues = pruneMatchQueues(store);
  const normalizedDistanceKm = normalizeMatchQueueDistance(distanceKm);
  queues[mode] = queues[mode].filter((entry) => entry.userId !== userId);
  const queueEntry = {
    id: nextId(`${mode}-queue`),
    userId,
    distanceKm: normalizedDistanceKm,
    slotStartAt,
    requestedAt: new Date().toISOString(),
    testMode: options.testMode === true,
    ...(options.expiresAt ? { expiresAt: options.expiresAt } : {}),
  };
  queues[mode].push(queueEntry);
  return queueEntry;
}

export function removeUsersFromMatchQueue(store, mode, userIds) {
  if (!userIds.length) {
    return;
  }

  const queues = ensureMatchQueues(store);
  const blockedUserIds = new Set(userIds);
  queues[mode] = queues[mode].filter((entry) => !blockedUserIds.has(entry.userId));
}

export function countUserQueueRefs(store, userId) {
  const queues = ensureMatchQueues(store);
  return ['duel', 'group'].reduce((count, mode) => (
    count + queues[mode].filter((entry) => entry.userId === userId).length
  ), 0);
}

export function getMatchQueueEntries(store, mode, distanceKm, slotStartAt, { testMode = false } = {}) {
  const normalizedDistanceKm = normalizeMatchQueueDistance(distanceKm);
  const queues = pruneMatchQueues(store);

  return queues[mode].filter((entry) => (
    Boolean(entry.testMode) === testMode
    && Math.abs(entry.distanceKm - normalizedDistanceKm) < 0.15
    && (testMode || entry.slotStartAt === slotStartAt)
  ));
}

// Builds the per-slot+distance key the upcoming-poll slot counts are tallied under.
// Distance is normalized to one decimal (the same bucketing the duel queue store uses
// when it persists entries), so two runners who pick the same recommended distance land
// in the same bucket. The client recomputes this exact key from its currently-selected
// duel distance to read the matching count. Keeping the distance in the key is what makes
// the badge reflect runners the viewer could ACTUALLY pair with (same time AND distance),
// instead of the old slot-global tally that mixed incompatible distances together.
export function buildDuelSlotCountKey(slotStartAt, distanceKm) {
  return `${slotStartAt}|${normalizeMatchQueueDistance(distanceKm)}`;
}

// Per-slot+distance tally of REAL (non-testMode) duel searchers, keyed by
// `${slotStartAt}|${normalizedDistanceKm}`. EXCLUDES the viewing user's own entry so a
// lone searcher never counts themselves ("N명 대기" always means N OTHER matchable
// runners). Buckets with no OTHER searchers are absent from the result. Prunes the queues
// first so expired/past-cutoff entries are never counted. Powers the upcoming-poll slot
// counts; the viewer (currentUserId) is passed through from the upcoming-matches builder.
export function countDuelQueueBySlot(store, { now = new Date(), currentUserId = null } = {}) {
  const queues = pruneMatchQueues(store, now);
  const countsByKey = {};

  for (const entry of queues.duel) {
    if (entry.testMode) {
      continue;
    }

    if (currentUserId !== null && entry.userId === currentUserId) {
      continue;
    }

    const slotKey = entry.slotStartAt;

    if (typeof slotKey !== 'string' || !slotKey || typeof entry.distanceKm !== 'number') {
      continue;
    }

    const countKey = buildDuelSlotCountKey(slotKey, entry.distanceKm);
    countsByKey[countKey] = (countsByKey[countKey] ?? 0) + 1;
  }

  return countsByKey;
}

export function findAnyQueuedMatchEntryForUser(store, userId) {
  const queues = pruneMatchQueues(store);

  for (const mode of ['duel', 'group']) {
    const entry = queues[mode].find((item) => item.userId === userId);

    if (entry) {
      return { mode, entry };
    }
  }

  return null;
}
