import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { RunningMatchRoom } from '@/lib/api/types';
import type { runActiveRoomCheck } from '@/features/runs/sync/activeRoomCheck';
import { isMatchRoomExiting } from '@/features/runs/lifecycle/matchRoomExitGuard';
import {
  isMatchRoomDeleted,
  markMatchRoomDeletedFromMissingActiveRoom,
  markMatchRoomHostTransferObserved,
} from '@/features/runs/lifecycle/matchRoomDeletionTombstone';
import {
  getActiveRoomCheckResultSkipReason,
} from '@/features/runs/sync/activeRoomCheck';
import {
  buildActiveRoomResultLogDetail,
  buildActiveRoomSnapshotKey,
} from '@/features/runs/sync/activeRoomResult';
import {
  shouldAcceptServerSnapshot,
} from '@/features/runs/sync/serverClockSync';
import { rgPerfMark, rgPerfMeasureStart } from '@/utils/rgPerfTrace';
import type { InviteInboxReceiver } from './useInviteInboxReceiver';

type ActiveRoomCheckResult = Awaited<ReturnType<typeof runActiveRoomCheck>>;

export async function handleMatchRoomActiveRoomResult({
  activeRoomCheckResult,
  buildRouteKey,
  commitRoom,
  currentUserTag,
  handleRecipientInviteInbox,
  lastHandledActiveRoomSnapshotKeyRef,
  latestRoomServerNowMsRef,
  liveMatchHandoffRef,
  markLiveMatchHandoff,
  mountedRef,
  pollingPausedRef,
  roomRef,
  setError,
  syncServerClock,
}: {
  activeRoomCheckResult: ActiveRoomCheckResult;
  buildRouteKey: () => string;
  commitRoom: (nextRoom: RunningMatchRoom | null) => void;
  currentUserTag: string;
  handleRecipientInviteInbox: InviteInboxReceiver;
  lastHandledActiveRoomSnapshotKeyRef: MutableRefObject<string | null>;
  latestRoomServerNowMsRef: MutableRefObject<number>;
  liveMatchHandoffRef: MutableRefObject<{ matchId: string; roomId: string } | null>;
  markLiveMatchHandoff: (nextRoom: RunningMatchRoom, source: string) => void;
  mountedRef: MutableRefObject<boolean>;
  pollingPausedRef: MutableRefObject<boolean>;
  roomRef: MutableRefObject<RunningMatchRoom | null>;
  setError: Dispatch<SetStateAction<string | null>>;
  syncServerClock: (serverNow?: string, timingSource?: unknown) => void;
}) {
  const currentRouteKey = buildRouteKey();
  const skipReason = getActiveRoomCheckResultSkipReason({
    currentMatchId: roomRef.current?.linkedMatchId ?? null,
    currentRouteKey,
    result: activeRoomCheckResult,
  });

  if (skipReason) {
    const logDetail = {
      currentRouteKey,
      generation: activeRoomCheckResult.generation,
      reason: skipReason,
      requestId: activeRoomCheckResult.requestId,
      routeKey: activeRoomCheckResult.routeKey,
      source: 'match-room snapshot',
    };

    if (skipReason === 'stale-generation') {
      rgPerfMark('active room result skipped stale generation', logDetail);
    } else {
      rgPerfMark('active room result skipped duplicate', logDetail);
    }
    return null;
  }

  const payload = activeRoomCheckResult.payload;
  if (!payload) {
    return null;
  }

  const handoff = liveMatchHandoffRef.current;
  if (handoff && (!payload.room || payload.room.roomId === handoff.roomId)) {
    rgPerfMark('match-room state ignored after handoff', {
      incomingLinkedMatchId: payload.room?.linkedMatchId ?? null,
      incomingRoomId: payload.room?.roomId ?? null,
      incomingState: payload.room?.state ?? null,
      matchId: handoff.matchId,
      roomId: handoff.roomId,
      source: 'match-room snapshot',
    });
    return roomRef.current;
  }

  if (!mountedRef.current || pollingPausedRef.current) {
    rgPerfMark('active room result skipped duplicate', {
      reason: !mountedRef.current ? 'unmounted' : 'already navigating',
      source: 'match-room snapshot',
    });
    return null;
  }

  if (!shouldAcceptServerSnapshot(latestRoomServerNowMsRef, payload.serverNow)) {
    rgPerfMark('active room result skipped duplicate', {
      reason: 'stale result',
      source: 'match-room snapshot',
    });
    return null;
  }

  if (!payload.room) {
    markMatchRoomDeletedFromMissingActiveRoom({
      room: roomRef.current,
      source: 'match-room snapshot no-active-room',
    });
    commitRoom(null);
    setError(null);
    return null;
  }

  markMatchRoomHostTransferObserved({
    currentRoom: roomRef.current,
    nextRoom: payload.room,
    source: 'match-room snapshot',
  });

  if (isMatchRoomDeleted(payload.room?.roomId)) {
    rgPerfMark('active room result ignored deleted room', {
      roomId: payload.room?.roomId ?? null,
      source: 'match-room snapshot',
      state: payload.room?.state ?? null,
    });
    rgPerfMark('match-room snapshot ignored deleted room', {
      roomId: payload.room?.roomId ?? null,
      source: 'match-room snapshot',
      state: payload.room?.state ?? null,
    });
    commitRoom(null);
    setError(null);
    return null;
  }

  if (isMatchRoomExiting(payload.room?.roomId)) {
    const endStaleCleanupTrace = rgPerfMeasureStart('stale room cleanup', {
      roomId: payload.room?.roomId ?? null,
      source: 'match-room exit guard',
    });
    commitRoom(null);
    endStaleCleanupTrace({ success: true });
    setError(null);
    return null;
  }

  const snapshotKey = buildActiveRoomSnapshotKey({
    room: payload.room,
    userId: currentUserTag,
  });
  if (lastHandledActiveRoomSnapshotKeyRef.current === snapshotKey) {
    rgPerfMark('active room result skipped duplicate', buildActiveRoomResultLogDetail({
      reason: 'same room snapshot',
      room: payload.room,
      snapshotKey,
      source: 'match-room snapshot',
    }));
    return roomRef.current;
  }

  lastHandledActiveRoomSnapshotKeyRef.current = snapshotKey;
  rgPerfMark('active room result handled', buildActiveRoomResultLogDetail({
    room: payload.room,
    snapshotKey,
    source: 'match-room snapshot',
  }));

  syncServerClock(payload.serverNow, payload);
  if (payload.room) {
    rgPerfMark('already joined room detected', {
      roomId: payload.room.roomId,
      source: 'match-room snapshot',
      state: payload.room.state,
    });
  }

  const nextRoom = payload.room;
  if (nextRoom?.linkedMatchId) {
    rgPerfMark('invite inbox fetch skipped active match', {
      linkedMatchId: nextRoom.linkedMatchId,
      roomId: nextRoom.roomId,
      source: 'match-room snapshot',
      userId: currentUserTag,
    });
  } else if (nextRoom?.roomId && nextRoom.joined === true) {
    rgPerfMark('invite inbox already joined check suppressed', {
      roomId: nextRoom.roomId,
      source: 'match-room snapshot',
      userId: currentUserTag,
    });
  } else {
    handleRecipientInviteInbox(nextRoom, 'match-room snapshot');
  }
  commitRoom(nextRoom);
  if (nextRoom?.linkedMatchId) {
    markLiveMatchHandoff(nextRoom, 'match-room snapshot');
  }
  setError(null);
  return nextRoom;
}
