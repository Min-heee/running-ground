import { useRef } from 'react';

export function useRoomSnapshotRuntimeRefs() {
  const lastDisplayedInviteKeyRef = useRef<string | null>(null);
  const lastHandledActiveRoomSnapshotKeyRef = useRef<string | null>(null);
  const lastInviteInboxPollStartedAtRef = useRef(0);
  const mountedRef = useRef(true);
  const screenFocusedRef = useRef(false);

  return {
    lastDisplayedInviteKeyRef,
    lastHandledActiveRoomSnapshotKeyRef,
    lastInviteInboxPollStartedAtRef,
    mountedRef,
    screenFocusedRef,
  };
}
