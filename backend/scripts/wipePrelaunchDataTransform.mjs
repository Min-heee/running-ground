// wipePrelaunchDataTransform.mjs — pure store mutator for the one-off post-launch wipe of
// pre-launch test data (2026-07-21). The app launched on the App Store with a store full of
// internal test accounts/runs/matches; everything user-generated goes EXCEPT the accounts in
// keepUsernames (default: reviewer01 — Apple is actively reviewing 1.0.1 with that login, so
// deleting it mid-review = instant rejection).
//
// What is removed (relative to the kept users):
//   users                        — every user whose username is not kept
//   runs                         — runs owned by removed users (ids reported for the
//                                  run_routes side-table purge the CLI performs afterwards)
//   integrationImports           — import ledger rows of removed users
//   phoneVerificationChallenges  — challenges whose phone doesn't belong to a kept user
//                                  (kept so a reviewer mid-OTP-flow is never broken)
//   sessions                     — auth sessions of removed users (kept users stay logged in)
//   friendRequests               — any request touching a removed user
//   friendships                  — any friendship touching a removed user
//   rewardRedemptions            — redemptions by removed users
//   notifications                — notifications addressed to removed users
//   liveRunShares                — live-share toggles of removed users
//   offlineRaceEvents[].registeredUserTags — race registrations by removed users' publicTag
//                                  (the events themselves are kept — they're content)
//   matchQueues / matchSessions / matchRooms — cleared entirely (transient live-match state;
//                                  run the wipe when no match is in flight)
//
// What is NEVER touched (seed/content collections): version, marketCatalog, notices,
// offlineRaceEvents themselves, offlineRaceGuideSteps, regionTree.
//
// Removal matrix cross-checked against adminRepository.deleteUser (the per-user cascade) —
// this covers everything it covers plus notifications/liveRunShares/phone challenges.
//
// Pure & synchronous (mutateStore contract), idempotent — a second run removes nothing.

function normalizePhone(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function normalizeUsername(value) {
  return String(value ?? '').trim().toLowerCase();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function wipePrelaunchData(store, { keepUsernames = ['reviewer01'] } = {}) {
  const keepSet = new Set(
    keepUsernames.map(normalizeUsername).filter((name) => name.length > 0),
  );

  const allUsers = asArray(store.users);
  const keptUsers = allUsers.filter((user) => keepSet.has(normalizeUsername(user?.username)));
  const keptUserIds = new Set(keptUsers.map((user) => user.id));
  const keptPhones = new Set(
    keptUsers.map((user) => normalizePhone(user.phone)).filter((phone) => phone.length > 0),
  );
  const foundUsernames = new Set(keptUsers.map((user) => normalizeUsername(user.username)));
  const missingKeepUsernames = [...keepSet].filter((name) => !foundUsernames.has(name));

  const removedCounts = {};
  const removedRunIds = [];
  const removedUserIds = allUsers
    .filter((user) => !keptUserIds.has(user?.id))
    .map((user) => user?.id)
    .filter((id) => typeof id === 'string' && id.length > 0);

  function replaceCollection(key, keepPredicate) {
    const current = asArray(store[key]);
    const kept = current.filter(keepPredicate);
    removedCounts[key] = current.length - kept.length;
    store[key] = kept;
  }

  replaceCollection('users', (user) => keptUserIds.has(user?.id));
  replaceCollection('runs', (run) => {
    const keep = keptUserIds.has(run?.userId);
    if (!keep && typeof run?.id === 'string' && run.id) {
      removedRunIds.push(run.id);
    }
    return keep;
  });
  replaceCollection('integrationImports', (entry) => keptUserIds.has(entry?.userId));
  replaceCollection('phoneVerificationChallenges', (entry) => keptPhones.has(normalizePhone(entry?.phone)));
  replaceCollection('sessions', (entry) => keptUserIds.has(entry?.userId));
  replaceCollection('friendRequests', (entry) => (
    keptUserIds.has(entry?.requesterId) && keptUserIds.has(entry?.receiverId)
  ));
  replaceCollection('friendships', (entry) => (
    asArray(entry?.userIds).length > 0
    && asArray(entry?.userIds).every((id) => keptUserIds.has(id))
  ));
  replaceCollection('rewardRedemptions', (entry) => keptUserIds.has(entry?.userId));
  replaceCollection('notifications', (entry) => keptUserIds.has(entry?.userId));
  replaceCollection('liveRunShares', (entry) => keptUserIds.has(entry?.userId));

  // Offline race events are content and stay, but their per-user registrations
  // (publicTag lists — see adminRepository.deleteUser) must drop removed users.
  const keptPublicTags = new Set(
    keptUsers.map((user) => user.publicTag).filter((tag) => typeof tag === 'string' && tag),
  );
  removedCounts.offlineRaceRegistrations = 0;
  for (const event of asArray(store.offlineRaceEvents)) {
    const tags = asArray(event?.registeredUserTags);
    const keptTags = tags.filter((tag) => keptPublicTags.has(tag));
    removedCounts.offlineRaceRegistrations += tags.length - keptTags.length;
    if (event && typeof event === 'object') {
      event.registeredUserTags = keptTags;
    }
  }

  // Live-match state is transient and cross-references users heavily — clear it wholesale.
  removedCounts.matchSessions = asArray(store.matchSessions).length;
  store.matchSessions = [];
  removedCounts.matchRooms = asArray(store.matchRooms).length;
  store.matchRooms = [];
  removedCounts.matchQueueEntries = 0;
  if (store.matchQueues && typeof store.matchQueues === 'object') {
    for (const key of Object.keys(store.matchQueues)) {
      removedCounts.matchQueueEntries += asArray(store.matchQueues[key]).length;
      store.matchQueues[key] = [];
    }
  }

  const totalRemoved = Object.values(removedCounts).reduce((sum, count) => sum + count, 0);

  return {
    keepUsernames: [...keepSet],
    keptUsernames: keptUsers.map((user) => user.username),
    missingKeepUsernames,
    keptUserIds: [...keptUserIds],
    removedUserIds,
    removedRunIds,
    removedCounts,
    totalRemoved,
    keptCounts: {
      users: store.users.length,
      runs: store.runs.length,
      sessions: store.sessions.length,
      notifications: store.notifications.length,
    },
  };
}
