import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { RunningMatchRoom } from '@/lib/api/types';
import { getApiErrorMessage } from '@/services/apiError';
import { runActiveRoomCheck } from '@/features/runs/sync/activeRoomCheck';
import { getLastActiveRoomCheck } from '@/features/runs/sync/activeRoomCheckRequestRegistry';
import { rgPerfMark, rgPerfMeasureStart } from '@/utils/rgPerfTrace';
import { isRgInputInteractionRecent } from '@/utils/rgInputTrace';
import { isMatchRoomReservedForFuture } from '@/features/runs/lifecycle/matchRoomFlow';
import { getSharedServerClockOffsetMs } from '@/features/runs/sync/serverClockSync';
import { getInviteInboxDebounceMs } from './roomSnapshotPollingPolicy';

type ActiveRoomCheckResult = Awaited<ReturnType<typeof runActiveRoomCheck>>;

// RUNTIME→LOBBY BRIDGE freshness: how recent the background running-tab runtime's successful
// /rooms/my payload (the 'track-run experience' module cache) must be for the lobby to adopt it.
// Covers the observed starvation: the runtime learns the host-start (linkedMatchId) within ~1-2s
// via its own pollers while the lobby's own fetches are slow/timed-out on a congested device —
// without this the guest sat in the 대기실 for 30s+ while its runtime already knew the match.
const RUNTIME_ROOM_BRIDGE_FRESH_MS = 15_000;

export function useRoomSnapshotFetcher({
  buildRouteKey,
  handleActiveRoomSnapshotResult,
  lastInviteInboxPollStartedAtRef,
  mountedRef,
  pollingPausedRef,
  recipientUserId,
  roomRef,
  screenFocusedRef,
  setError,
}: {
  buildRouteKey: () => string;
  handleActiveRoomSnapshotResult: (activeRoomCheckResult: ActiveRoomCheckResult) => Promise<RunningMatchRoom | null>;
  lastInviteInboxPollStartedAtRef: MutableRefObject<number>;
  mountedRef: MutableRefObject<boolean>;
  pollingPausedRef: MutableRefObject<boolean>;
  recipientUserId: string;
  roomRef: MutableRefObject<RunningMatchRoom | null>;
  screenFocusedRef: MutableRefObject<boolean>;
  setError: Dispatch<SetStateAction<string | null>>;
}) {
  return useCallback(async () => {
    if (pollingPausedRef.current || !screenFocusedRef.current) {
      rgPerfMark('invite inbox polling skipped idle', {
        paused: pollingPausedRef.current,
        source: 'match-room snapshot',
        focused: screenFocusedRef.current,
      });
      return null;
    }

    const routeKey = buildRouteKey();
    const currentRoom = roomRef.current;
    // 예약 파티런(슬롯이 카운트다운 창 밖)은 링크돼 있어도 계속 조회한다 — 상대의 이탈·취소·
    // 늦은 합류를 보여줘야 한다. 방장 시작 방과 카운트다운 창 안의 예약은 예전처럼 멈춘다.
    if (currentRoom?.linkedMatchId && !isMatchRoomReservedForFuture(currentRoom, Date.now() + getSharedServerClockOffsetMs())) {
      rgPerfMark('active room check skipped live match mounted', {
        linkedMatchId: currentRoom.linkedMatchId,
        reason: 'linked-match',
        roomId: currentRoom.roomId,
        routeKey,
        source: 'match-room snapshot',
      });
      return currentRoom;
    }

    if (isRgInputInteractionRecent()) {
      rgPerfMark('active room check suppressed by user interaction', {
        routeKey,
        source: 'match-room snapshot',
      });
      return roomRef.current;
    }

    const nowMs = Date.now();
    const debounceMs = getInviteInboxDebounceMs();
    const elapsedSinceLastPollMs = nowMs - lastInviteInboxPollStartedAtRef.current;

    if (lastInviteInboxPollStartedAtRef.current && elapsedSinceLastPollMs < debounceMs) {
      rgPerfMark('invite inbox polling debounced', {
        debounceMs,
        elapsedMs: elapsedSinceLastPollMs,
        routeKey,
        source: 'match-room snapshot',
      });
      return roomRef.current;
    }

    lastInviteInboxPollStartedAtRef.current = nowMs;
    const endInviteInboxPollingTrace = rgPerfMeasureStart('invite inbox polling', {
      routeKey,
      source: 'match-room snapshot',
    });
    rgPerfMark('invite inbox query key', {
      queryUserId: recipientUserId,
      queryUserTag: recipientUserId,
      routeKey,
      source: 'match-room snapshot',
    });
    rgPerfMark('invite inbox fetch for recipient begin', {
      routeKey,
      source: 'match-room snapshot',
      userId: recipientUserId,
    });

    try {
      const activeRoomCheckResult = await runActiveRoomCheck({
        routeKey,
        source: 'match-room snapshot',
      });
      endInviteInboxPollingTrace({
        requestId: activeRoomCheckResult.requestId,
        success: true,
      });
      rgPerfMark('invite inbox fetch for recipient end', {
        requestId: activeRoomCheckResult.requestId,
        roomId: activeRoomCheckResult.payload?.room?.roomId ?? null,
        routeKey,
        source: 'match-room snapshot',
        success: true,
        userId: recipientUserId,
      });

      const handledRoom = await handleActiveRoomSnapshotResult(activeRoomCheckResult);

      // RUNTIME→LOBBY BRIDGE: if this lobby still has no linked room (its own fetch timed out,
      // was slow, or simply hasn't caught the host-start yet), adopt the background running-tab
      // runtime's LAST SUCCESSFUL /rooms/my payload when it is fresh, for the SAME room, and
      // carries a linkedMatchId. The synthesized result goes through the SAME handler, so every
      // existing guard (monotonic serverNow, exit/deletion tombstones, snapshot-key dedup) still
      // applies — re-feeding an identical cache entry dedupes to a no-op, and the moment a linked
      // room commits, the linked-match early-return above stops this fetcher entirely. No new
      // hook/effect/subscription — runs inside the existing async tick, so it cannot loop.
      if (!handledRoom?.linkedMatchId && !roomRef.current?.linkedMatchId) {
        const runtimeCheck = getLastActiveRoomCheck('track-run experience');
        const runtimeRoom = runtimeCheck?.payload?.room ?? null;
        const lobbyRoomId = roomRef.current?.roomId ?? null;
        if (
          runtimeCheck
          && runtimeRoom?.linkedMatchId
          && lobbyRoomId
          && runtimeRoom.roomId === lobbyRoomId
          && Date.now() - runtimeCheck.completedAtMs <= RUNTIME_ROOM_BRIDGE_FRESH_MS
        ) {
          rgPerfMark('active room bridged from runtime cache', {
            linkedMatchId: runtimeRoom.linkedMatchId,
            roomId: runtimeRoom.roomId,
            routeKey,
            source: 'match-room snapshot',
          });
          return handleActiveRoomSnapshotResult({
            completedAtMs: runtimeCheck.completedAtMs,
            generation: runtimeCheck.generation,
            payload: runtimeCheck.payload,
            requestId: runtimeCheck.requestId,
            // The CURRENT route key — the cache entry's own routeKey belongs to the runtime's
            // route and would trip the route-changed skip.
            routeKey,
            reused: true,
            skipped: false,
            stale: false,
            startedAtMs: runtimeCheck.startedAtMs,
            timedOut: false,
          });
        }
      }

      return handledRoom;
    } catch (roomError) {
      endInviteInboxPollingTrace({
        success: false,
      });
      rgPerfMark('invite inbox fetch for recipient end', {
        message: getApiErrorMessage(roomError, '대기실을 불러오지 못했어요.'),
        routeKey,
        source: 'match-room snapshot',
        success: false,
        userId: recipientUserId,
      });
      if (!mountedRef.current || pollingPausedRef.current) {
        return null;
      }

      setError(getApiErrorMessage(roomError, '대기실을 불러오지 못했어요.'));
      return null;
    }
  }, [
    buildRouteKey,
    handleActiveRoomSnapshotResult,
    lastInviteInboxPollStartedAtRef,
    mountedRef,
    pollingPausedRef,
    recipientUserId,
    roomRef,
    screenFocusedRef,
    setError,
  ]);
}
