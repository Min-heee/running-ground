// FACADE — matchRoomStoreHelpers.mjs was split into src/lib/matchRoom/ (pure code MOVE,
// zero behavior change). The implementation now lives in:
//   matchRoom/matchRoomCore.mjs      — room store primitive + room state machine + prune
//   matchRoom/matchRoomSync.mjs      — countdown arming (armRunningMatchRoomCountdown) + sync pipeline + finders
//   matchRoom/matchRoomResponses.mjs — response payloads + request-blocker computation
//   matchRoom/matchRoomActions.mjs   — the user-action handlers (create/join/start/ready/ack/update/leave)
//   matchRoom/matchRoomCleanup.mjs   — stale-state cleanup + force reset + request gate
// This file re-exports the original public surface so existing importers need no changes.
export { pruneMatchRooms } from './matchRoom/matchRoomCore.mjs';
export {
  findRunningMatchRoomForUser,
  findRunningMatchRoomInviteInboxForUser,
  syncMatchRooms,
} from './matchRoom/matchRoomSync.mjs';
export { buildRunningMatchRoomResponse } from './matchRoom/matchRoomResponses.mjs';
export {
  acknowledgeRunningMatchRoomCountdown,
  createRunningMatchRoom,
  joinRunningMatchRoom,
  leaveRunningMatchRoom,
  startRunningMatchRoom,
  updateRunningMatchRoom,
  updateRunningMatchRoomReady,
} from './matchRoom/matchRoomActions.mjs';
export {
  assertUserCanRequestAnotherMatch,
  cleanupStaleRunningMatchRoomState,
  forceResetRunningMatchStateForUser,
} from './matchRoom/matchRoomCleanup.mjs';
//   matchRoom/matchRoomReservation.mjs — 예약 파티런의 되돌리기(취소·방 삭제·게스트 이탈) (2026-09-09)
export {
  cancelReservedPartySession,
  findPendingReservedPartySession,
  isPendingScheduledPartySession,
  withdrawFromReservedPartySession,
} from './matchRoom/matchRoomReservation.mjs';
