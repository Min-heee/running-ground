import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { RunningMatchStatusResponse } from '@/lib/api/types';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import type { PartyRunLinkedMatchContext } from '@/features/runs/types/matchStateMachine';
import {
  getBackgroundRunTrackingSnapshot,
  getBackgroundRunElapsedSeconds,
  subscribeBackgroundRunTracking,
} from '@/features/runs/tracking/background';
import {
  clearLiveCardMatchStatusHook,
  setLiveCardMatchStatusHook,
} from '@/features/runs/tracking/background/backgroundMatchProgressSync';
import {
  endLiveActivityForRun,
  startLiveActivityForRun,
  updateLiveActivityForMatch,
  updateLiveActivityForSolo,
  type LiveActivityRunContext,
} from '@/features/runs/liveActivity/liveActivityController';
import { isLiveActivityAvailable } from '../../../../modules/live-activity';

// Wires the iOS Live Activity (lock-screen live-run card + Dynamic Island) into the run/match
// lifecycle. OTA-SAFE + FIRE-AND-FORGET: every effect first checks isLiveActivityAvailable() (false
// on every current binary + always false on Android), so on production today this hook does
// nothing — it registers/clears module-level callbacks but every callback no-ops. It NEVER awaits,
// NEVER mutates the bg-sync promise / throttle / inflight guards, and NEVER throws into the run
// flow (the controller swallows). iOS-only.

// The runtime's linked-match ref. Typed as the shared PartyRunLinkedMatchContext so the runtime can
// pass its own ref directly (MutableRefObject is invariant — a structural subtype would not assign).
type RoomLinkedMatchContextLike = PartyRunLinkedMatchContext | null;

export type UseLiveActivityBridgeInput = {
  isRunning: boolean;
  matchMode: RunMatchMode;
  // Display name for the current user on the match rank bar.
  myName: string;
  // Per-mode goal distances (the match target / solo goal). Solo with no goal passes undefined.
  duelDistanceKm: number;
  groupDistanceKm: number;
  soloGoalDistanceKm?: number;
  // Live "me" metrics, refreshed by the tracking session (used for the match board's "me" row).
  distanceKm: number;
  elapsedSecondsRef: MutableRefObject<number>;
  // Active match status refs (for the active matchId + slotStartAt = the run's official start).
  duelMatchStatusRef: MutableRefObject<RunningMatchStatusResponse | null>;
  groupMatchStatusRef: MutableRefObject<RunningMatchStatusResponse | null>;
  roomLinkedMatchContextRef: MutableRefObject<RoomLinkedMatchContextLike>;
};

function resolveActiveMatch(
  matchMode: RunMatchMode,
  duelMatchStatusRef: MutableRefObject<RunningMatchStatusResponse | null>,
  groupMatchStatusRef: MutableRefObject<RunningMatchStatusResponse | null>,
  roomLinkedMatchContextRef: MutableRefObject<RoomLinkedMatchContextLike>,
): { matchId: string; slotStartAt: string } | null {
  const roomLinked = roomLinkedMatchContextRef.current;
  if (roomLinked && roomLinked.mode === matchMode) {
    return { matchId: roomLinked.matchId, slotStartAt: roomLinked.slotStartAt };
  }
  const status = matchMode === 'group' ? groupMatchStatusRef.current : duelMatchStatusRef.current;
  if (status?.matchId) {
    return { matchId: status.matchId, slotStartAt: status.slotStartAt };
  }
  return null;
}

export function useLiveActivityBridge({
  isRunning,
  matchMode,
  myName,
  duelDistanceKm,
  groupDistanceKm,
  soloGoalDistanceKm,
  distanceKm,
  elapsedSecondsRef,
  duelMatchStatusRef,
  groupMatchStatusRef,
  roomLinkedMatchContextRef,
}: UseLiveActivityBridgeInput) {
  // All inputs the fire-and-forget callbacks read flow through this ref so the registered hooks /
  // snapshot listener never close over stale values (mirrors the runtime's applier-ref pattern).
  const inputRef = useRef({
    isRunning,
    matchMode,
    myName,
    duelDistanceKm,
    groupDistanceKm,
    soloGoalDistanceKm,
    distanceKm,
    elapsedSecondsRef,
    duelMatchStatusRef,
    groupMatchStatusRef,
    roomLinkedMatchContextRef,
  });
  inputRef.current = {
    isRunning,
    matchMode,
    myName,
    duelDistanceKm,
    groupDistanceKm,
    soloGoalDistanceKm,
    distanceKm,
    elapsedSecondsRef,
    duelMatchStatusRef,
    groupMatchStatusRef,
    roomLinkedMatchContextRef,
  };

  // Last match status response seen by the bg-flush hook, captured so the FOREGROUND snapshot
  // subscription (which fires on every GPS commit, screen-on) can also refresh the match card's
  // board/rank/gap — not just the background flush. Without this, a match card's distance/pace/gap
  // never updated while the app was foreground (the bg hook only fires when isAppBackground). Kept
  // in a ref (not state) so it never triggers a re-render and stays fire-and-forget.
  const lastMatchStatusRef = useRef<RunningMatchStatusResponse | null>(null);

  // Build the static run context from the CURRENT inputs. Reads refs so the active matchId /
  // slotStartAt are always fresh.
  const buildRunContext = (): LiveActivityRunContext | null => {
    const input = inputRef.current;
    // chase(경찰과 도둑런)는 매치 세션이 없는 솔로형 러닝 — 솔로 락스크린 카드로 흘린다.
    const mode: LiveActivityRunContext['mode'] = input.matchMode === 'solo' || input.matchMode === 'chase'
      ? 'solo'
      : input.matchMode === 'group'
        ? 'group'
        : 'duel';

    if (mode === 'solo') {
      const snapshot = getBackgroundRunTrackingSnapshot({ cloneRoute: false });
      return {
        mode: 'solo',
        goalDistanceKm: input.soloGoalDistanceKm,
        // Start the card immediately at run start — don't wait for the first GPS-tracked
        // startedAt (which lags by the countdown + first fix, which is why the card showed
        // up late). The card's displayed time/distance/pace are driven by the subsequent
        // updateLiveActivity calls, so a 'now' fallback just lets the card appear right away
        // and fill in.
        startedAt: snapshot.startedAt ?? new Date().toISOString(),
        myName: input.myName,
      };
    }

    const active = resolveActiveMatch(
      input.matchMode,
      input.duelMatchStatusRef,
      input.groupMatchStatusRef,
      input.roomLinkedMatchContextRef,
    );
    if (!active) {
      return null;
    }
    return {
      mode,
      matchId: active.matchId,
      goalDistanceKm: mode === 'group' ? input.groupDistanceKm : input.duelDistanceKm,
      startedAt: active.slotStartAt,
      myName: input.myName,
    };
  };

  // Run start/end + per-run subscriptions. Re-runs when isRunning flips. Every body no-ops on
  // current binaries via isLiveActivityAvailable().
  useEffect(() => {
    if (!isRunning) {
      return undefined;
    }

    if (!isLiveActivityAvailable()) {
      return undefined;
    }

    const context = buildRunContext();
    if (!context) {
      return undefined;
    }

    startLiveActivityForRun(context, {
      distanceKm: inputRef.current.distanceKm,
      elapsedSeconds: inputRef.current.elapsedSecondsRef.current,
      isRunning: inputRef.current.isRunning,
      // Capture the push instant so the native timer's pause-aware anchor (timerStartMs =
      // nowMs − elapsedSeconds*1000) is computed against this exact moment.
      nowMs: Date.now(),
    });

    // MATCH path: register the fire-and-forget bg-flush hook so every background match status
    // response (the only POST while the screen is off) refreshes the card WITHOUT a JS timer.
    const matchStatusHook = (status: RunningMatchStatusResponse) => {
      // Cache the freshest status so the foreground snapshot subscription below can also reuse it
      // to keep the match board/rank/gap live while the screen is on (the bg flush is bg-only).
      lastMatchStatusRef.current = status;
      const liveContext = buildRunContext();
      if (!liveContext || liveContext.mode === 'solo') {
        return;
      }
      const snapshot = getBackgroundRunTrackingSnapshot({ cloneRoute: false });
      updateLiveActivityForMatch(liveContext, status, {
        distanceKm: snapshot.distanceKm,
        elapsedSeconds: Math.max(
          inputRef.current.elapsedSecondsRef.current,
          getBackgroundRunElapsedSeconds(snapshot),
        ),
        // Freeze the native clock when the run is paused (snapshot status), else let it tick.
        isRunning: snapshot.status === 'running',
        // Re-anchor the pause-aware native timer to this push instant.
        nowMs: Date.now(),
      });
    };
    setLiveCardMatchStatusHook(matchStatusHook);

    // SOLO + FOREGROUND MATCH path: refresh the card on each tracking snapshot commit (fires on
    // every GPS tick, screen-on). Solo pushes its time/distance/pace; match reuses the last-seen
    // status response to keep the board/rank/gap live in the foreground — the bg-flush hook above
    // only fires while the screen is OFF, so without this the match card never updated foreground.
    // Fire-and-forget; the controller no-ops until a start + native ship.
    const unsubscribe = subscribeBackgroundRunTracking((snapshot) => {
      const liveContext = buildRunContext();
      if (!liveContext) {
        return;
      }
      const elapsedSeconds = Math.max(
        inputRef.current.elapsedSecondsRef.current,
        getBackgroundRunElapsedSeconds(snapshot),
      );
      // Freeze the native clock when the run is paused (snapshot status), else let it tick. This is
      // what makes a PAUSE freeze the lock-screen TIME at the real frozen elapsed instead of a raw
      // native timer that would keep counting wall-clock past the pause.
      const isRunning = snapshot.status === 'running';
      // Capture the push instant ONCE so both branches anchor the pause-aware native timer
      // (timerStartMs = nowMs − elapsedSeconds*1000) against the same moment.
      const nowMs = Date.now();
      if (liveContext.mode === 'solo') {
        updateLiveActivityForSolo(liveContext, {
          distanceKm: snapshot.distanceKm,
          elapsedSeconds,
          isRunning,
          nowMs,
        });
        return;
      }
      // Match foreground refresh: draw from the freshest status we have. The bg-flush cache is
      // BACKGROUND-ONLY (its feeder lives behind flushBackgroundMatchProgressSync's isAppBackground
      // gate), so on a screen-on run it stays null forever and this used to return here every tick —
      // the card then showed nothing but its start content for the whole run: 시간 ticked (the widget
      // clock is native and needs no push) while 페이스/간격 sat at the "--" sentinel the start push
      // wrote. The runtime already polls match status in the foreground and keeps it in these refs,
      // so fall back to them; the board/gap are then as fresh as the last poll, and pace/distance as
      // fresh as this GPS tick. Only a match with no status at all (pre-first-response) skips.
      const liveMatchStatusRef = liveContext.mode === 'group'
        ? inputRef.current.groupMatchStatusRef
        : inputRef.current.duelMatchStatusRef;
      // 폴링 ref가 **먼저**다. 아래의 bg 캐시는 백그라운드 구간마다 한 번 쓰이고 화면이 켜진
      // 동안에는 영영 갱신되지 않는다(그 공급자가 !isAppBackground에서 곧장 되돌아간다).
      // 그래서 캐시를 우선하면 깨어난 뒤 내 거리만 1초마다 새로워지고 상대는 잠들기 직전
      // 값에 붙박여, 잠금화면의 간격이 자신 있게 틀린 숫자가 된다(앱 안의 보드와 서로 다른
      // 말을 한다). 폴링 ref는 백그라운드 응답도 결국 같은 경로로 받으며, 몰수·서버시각
      // 단조 가드를 통과한 값이다. 캐시는 첫 폴링 이전의 씨앗으로만 남긴다.
      const lastStatus = liveMatchStatusRef.current ?? lastMatchStatusRef.current;
      // 컨트롤러는 보드를 status에서, 정체성(matchId·목표)은 context에서 가져오며 둘을
      // 대조하지 않는다 — 끝난 매치의 상태가 다른 매치의 이름표를 달고 그려지지 않게 막는다.
      if (
        !lastStatus
        || (liveContext.matchId && lastStatus.matchId && lastStatus.matchId !== liveContext.matchId)
      ) {
        return;
      }
      updateLiveActivityForMatch(liveContext, lastStatus, {
        distanceKm: snapshot.distanceKm,
        elapsedSeconds,
        isRunning,
        nowMs,
      });
    }, { cloneRoute: false });

    return () => {
      clearLiveCardMatchStatusHook(matchStatusHook);
      unsubscribe();
      lastMatchStatusRef.current = null;
      // End + dismiss the card when the run stops (isRunning → false) or this component unmounts.
      endLiveActivityForRun();
    };
  }, [isRunning]);
}
