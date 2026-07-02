// FACADE — runningMatchSessionStoreHelpers.mjs was split into src/lib/runningMatchSession/
// (pure code MOVE, zero behavior change). The implementation now lives in:
//   runningMatchSession/matchSessionCore.mjs          — session store primitive + state machine (hydrateMatchSessionState)
//   runningMatchSession/matchSessionFallbackSeals.mjs — F4 seals + DNF sweep + the backFillFinisherSavedRunsImpl injection point
//   runningMatchSession/matchSessionLifecycle.mjs     — create/prune/find sessions
//   runningMatchSession/matchSessionSnapshots.mjs     — runner profiles + live snapshots + official standings
//   runningMatchSession/matchSessionVerdicts.mjs      — duel/group verdicts
// This file re-exports the original public surface so existing importers need no changes.
export {
  ensureMatchSessions,
  hydrateMatchSessionState,
} from './runningMatchSession/matchSessionCore.mjs';
export {
  isParticipantGroupSealedDnf,
  isParticipantSealedDnf,
  registerFinisherSavedRunBackfill,
  sealDuelFallbackResolutionIfElapsed,
  sealGroupFallbackResolutionIfElapsed,
  sweepStuckMatchSessionFallbacks,
} from './runningMatchSession/matchSessionFallbackSeals.mjs';
export {
  addParticipantToMatchSession,
  createMatchSession,
  findAnyReservedMatchSessionForUser,
  findJoinableGroupSession,
  findMatchSessionById,
  findMatchSessionForUser,
  pruneMatchSessions,
} from './runningMatchSession/matchSessionLifecycle.mjs';
export {
  buildMatchRunnerProfile,
  buildOfficialSessionStandings,
  buildParticipantLiveSnapshot,
  resolveSessionParticipantProfile,
} from './runningMatchSession/matchSessionSnapshots.mjs';
export {
  buildDuelVerdict,
  buildGroupVerdict,
} from './runningMatchSession/matchSessionVerdicts.mjs';
