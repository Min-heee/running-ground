// Compatibility barrel for existing route/server imports.
export {
  acceptRunningMatch,
  cancelRunningMatch,
  leaveRunningMatch,
  updateRunningMatchProgress,
} from './matchActionHandlers.mjs';

export {
  buildDuelMatchResponse,
  buildGroupMatchResponse,
  buildMatchDemandSummaryResponse,
  buildRunningMatchStatusResponse,
  buildUpcomingRunningMatchesResponse,
} from './matchResponseBuilders.mjs';

export { buildMatchResultByMatchId } from './matchResultBuilders.mjs';

export {
  acknowledgeRunningMatchRoomCountdown,
  buildRunningMatchRoomResponse,
  cleanupStaleRunningMatchRoomState,
  createRunningMatchRoom,
  findRunningMatchRoomForUser,
  findRunningMatchRoomInviteInboxForUser,
  forceResetRunningMatchStateForUser,
  joinRunningMatchRoom,
  leaveRunningMatchRoom,
  startRunningMatchRoom,
  updateRunningMatchRoom,
  updateRunningMatchRoomReady,
} from './matchRoomStoreHelpers.mjs';

export { validateMatchSlotStartAt } from './matchSlotValidation.mjs';
