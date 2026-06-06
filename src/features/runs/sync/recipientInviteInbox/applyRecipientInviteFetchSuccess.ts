import type { MutableRefObject } from 'react';
import {
  getRecipientInviteInboxFocusBlockReason,
  getRecipientInviteInboxStaleResultReason,
} from '@/features/runs/sync/roomInviteInbox';
import { shouldAcceptServerSnapshot } from '@/features/runs/sync/serverClockSync';
import type { RunningMatchRoom, RunningMatchRoomResponse } from '@/lib/api/types';
import { rgPerfMark } from '@/utils/rgPerfTrace';
import {
  buildRecipientInviteInboxDisplayedTraceEvents,
  buildRecipientInviteInboxDuplicateTraceEvent,
  buildRecipientInviteInboxNoEventTraceEvents,
  buildRecipientInviteInboxSuccessTraceEvents,
  processRecipientInviteResponse,
  shouldCommitRecipientInviteRoom,
} from './responseProcessing';
import type {
  RecipientInviteInboxRuntimeState,
  RecipientInviteInboxTraceEvent,
} from './types';

type ApplyRecipientInviteFetchSuccessInput = {
  commitMatchRoom: (room: RunningMatchRoom | null) => void;
  currentRoomRef: MutableRefObject<RunningMatchRoom | null>;
  currentUserId: string;
  endRecipientInviteFetchTrace: (
    endDetail?: Record<string, string | number | boolean | null | undefined>
  ) => number;
  lastAlreadyJoinedSkipKeyRef: MutableRefObject<string | null>;
  lastDisplayedRecipientInviteKeyRef: MutableRefObject<string | null>;
  latestMatchRoomServerNowMsRef: MutableRefObject<number>;
  payload: RunningMatchRoomResponse;
  roomAtStart: RunningMatchRoom | null;
  runtimeStateRef: MutableRefObject<RecipientInviteInboxRuntimeState>;
  source: string;
  syncServerClock: (serverNow?: string, timingSource?: unknown) => void;
};

function markRecipientInviteTraceEvents(events: RecipientInviteInboxTraceEvent[]) {
  events.forEach(({ name, payload }) => {
    rgPerfMark(name, payload);
  });
}

export function applyRecipientInviteFetchSuccess({
  commitMatchRoom,
  currentRoomRef,
  currentUserId,
  endRecipientInviteFetchTrace,
  lastAlreadyJoinedSkipKeyRef,
  lastDisplayedRecipientInviteKeyRef,
  latestMatchRoomServerNowMsRef,
  payload,
  roomAtStart,
  runtimeStateRef,
  source,
  syncServerClock,
}: ApplyRecipientInviteFetchSuccessInput) {
  const latestRuntimeState = runtimeStateRef.current;
  const latestBlockReason = getRecipientInviteInboxFocusBlockReason({
    activeRoomId: latestRuntimeState.activeRoomId,
    currentRoom: currentRoomRef.current,
    isLiveMatchMounted: latestRuntimeState.isLiveMatchMounted,
    linkedMatchId: latestRuntimeState.linkedMatchId,
    liveMatchKey: latestRuntimeState.liveMatchKey,
  });
  if (latestBlockReason) {
    endRecipientInviteFetchTrace({
      reason: latestBlockReason,
      roomId: payload.room?.roomId ?? null,
      success: false,
    });
    rgPerfMark('invite inbox fetch stale ignored', {
      currentLinkedMatchId: latestRuntimeState.linkedMatchId,
      currentRoomId: currentRoomRef.current?.roomId ?? latestRuntimeState.activeRoomId,
      reason: latestBlockReason,
      roomId: payload.room?.roomId ?? null,
      source,
      userId: currentUserId,
    });
    return;
  }

  const staleReason = getRecipientInviteInboxStaleResultReason({
    currentRoom: currentRoomRef.current,
    startedRoomId: roomAtStart?.roomId ?? null,
  });
  if (staleReason) {
    endRecipientInviteFetchTrace({
      reason: staleReason,
      roomId: payload.room?.roomId ?? null,
      success: false,
    });
    rgPerfMark('invite inbox fetch stale ignored', {
      currentLinkedMatchId: currentRoomRef.current?.linkedMatchId ?? null,
      currentRoomId: currentRoomRef.current?.roomId ?? null,
      reason: staleReason,
      roomId: payload.room?.roomId ?? null,
      source,
      userId: currentUserId,
    });
    return;
  }

  endRecipientInviteFetchTrace({
    roomId: payload.room?.roomId ?? null,
    success: true,
  });

  if (!shouldAcceptServerSnapshot(latestMatchRoomServerNowMsRef, payload.serverNow)) {
    rgPerfMark('invite inbox fetch stale ignored', {
      reason: 'server-snapshot',
      roomId: payload.room?.roomId ?? null,
      source,
      userId: currentUserId,
    });
    rgPerfMark('invite card display skipped reason', {
      reason: 'stale-result',
      roomId: payload.room?.roomId ?? null,
      source,
      userId: currentUserId,
    });
    return;
  }

  const responseModel = processRecipientInviteResponse({
    currentUserId,
    payload,
    previousInviteKey: lastDisplayedRecipientInviteKeyRef.current,
    source,
  });
  markRecipientInviteTraceEvents(buildRecipientInviteInboxSuccessTraceEvents({
    currentUserId,
    model: responseModel,
    payload,
    source,
  }));

  if (!responseModel.inviteResult.event) {
    const isAlreadyJoinedSuppressed = Boolean(
      responseModel.alreadyJoinedSkipKey
      && lastAlreadyJoinedSkipKeyRef.current === responseModel.alreadyJoinedSkipKey,
    );
    if (responseModel.alreadyJoinedSkipKey && !isAlreadyJoinedSuppressed) {
      lastAlreadyJoinedSkipKeyRef.current = responseModel.alreadyJoinedSkipKey;
    }
    markRecipientInviteTraceEvents(buildRecipientInviteInboxNoEventTraceEvents({
      currentUserId,
      isAlreadyJoinedSuppressed,
      model: responseModel,
      payload,
      source,
    }));
    return;
  }

  if (shouldCommitRecipientInviteRoom(responseModel)) {
    syncServerClock(payload.serverNow, payload);
    commitMatchRoom(payload.room);
  }

  if (!responseModel.inviteResult.shouldDisplay) {
    const duplicateTraceEvent = buildRecipientInviteInboxDuplicateTraceEvent({
      currentUserId,
      model: responseModel,
      source,
    });
    if (duplicateTraceEvent) {
      markRecipientInviteTraceEvents([duplicateTraceEvent]);
    }
    return;
  }

  lastDisplayedRecipientInviteKeyRef.current = responseModel.inviteResult.event.key;
  markRecipientInviteTraceEvents(buildRecipientInviteInboxDisplayedTraceEvents(responseModel));
}
