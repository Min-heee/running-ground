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
