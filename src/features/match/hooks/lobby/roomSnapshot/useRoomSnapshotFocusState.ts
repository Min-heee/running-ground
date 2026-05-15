import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { MutableRefObject } from 'react';
import { rgPerfMark } from '@/utils/rgPerfTrace';
import { getFocusedInviteInboxPollMs } from './roomSnapshotPollingPolicy';

export function useRoomSnapshotFocusState({
  mountedRef,
  screenFocusedRef,
}: {
  mountedRef: MutableRefObject<boolean>;
  screenFocusedRef: MutableRefObject<boolean>;
}) {
  const [screenFocused, setScreenFocused] = useState(false);

  useEffect(() => () => {
    mountedRef.current = false;
  }, [mountedRef]);

  useFocusEffect(useCallback(() => {
    screenFocusedRef.current = true;
    setScreenFocused(true);
    rgPerfMark('invite inbox polling focused only', {
      focused: true,
      intervalMs: getFocusedInviteInboxPollMs(),
      source: 'match-room snapshot',
    });

    return () => {
      screenFocusedRef.current = false;
      setScreenFocused(false);
    };
  }, [screenFocusedRef]));

  return {
    screenFocused,
  };
}
