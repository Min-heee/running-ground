import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { AppState } from 'react-native';
import type { RunningMatchRoom } from '@/lib/api/types';
import { rgPerfMark } from '@/utils/rgPerfTrace';
import { ACTIVE_ROOM_FOREGROUND_DEBOUNCE_MS } from './roomSnapshotPollingPolicy';

export function useRoomSnapshotForegroundRefresh({
  loadRoom,
  mountedRef,
  pollingPausedRef,
  screenFocusedRef,
}: {
  loadRoom: () => Promise<RunningMatchRoom | null>;
  mountedRef: MutableRefObject<boolean>;
  pollingPausedRef: MutableRefObject<boolean>;
  screenFocusedRef: MutableRefObject<boolean>;
}) {
  const appStateRef = useRef(AppState.currentState);
  const foregroundDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (
        previousState !== 'active'
        && nextState === 'active'
        && screenFocusedRef.current
        && !pollingPausedRef.current
      ) {
        if (foregroundDebounceTimerRef.current) {
          clearTimeout(foregroundDebounceTimerRef.current);
        }
        rgPerfMark('active room check foreground debounce', {
          delayMs: ACTIVE_ROOM_FOREGROUND_DEBOUNCE_MS,
          source: 'match-room snapshot',
        });
        rgPerfMark('invite inbox polling focused only', {
          debounceMs: ACTIVE_ROOM_FOREGROUND_DEBOUNCE_MS,
          reason: 'foreground-once',
          source: 'match-room snapshot',
        });
        foregroundDebounceTimerRef.current = setTimeout(() => {
          foregroundDebounceTimerRef.current = null;
          if (!mountedRef.current || !screenFocusedRef.current || pollingPausedRef.current) {
            return;
          }
          void loadRoom();
        }, ACTIVE_ROOM_FOREGROUND_DEBOUNCE_MS);
      }
    });

    return () => {
      if (foregroundDebounceTimerRef.current) {
        clearTimeout(foregroundDebounceTimerRef.current);
        foregroundDebounceTimerRef.current = null;
      }
      appStateSubscription.remove();
    };
  }, [appStateRef, loadRoom, mountedRef, pollingPausedRef, screenFocusedRef]);
}
