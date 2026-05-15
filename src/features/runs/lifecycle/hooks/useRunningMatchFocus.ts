import type { UseRunningMatchFocusInput } from '@/features/runs/lifecycle/hooks/runningMatchFocus/types';
import { useActiveRoomRecovery } from '@/features/runs/lifecycle/hooks/runningMatchFocus/useActiveRoomRecovery';
import { useLiveMatchNavigationOwner } from '@/features/runs/lifecycle/hooks/runningMatchFocus/useLiveMatchNavigationOwner';

export function useRunningMatchFocus(input: UseRunningMatchFocusInput) {
  const {
    focusRunningMatch,
    markLiveMatchMounted,
  } = useLiveMatchNavigationOwner(input);
  const {
    focusRoomLinkedMatch,
  } = useActiveRoomRecovery({
    focusRunningMatch,
  });

  return {
    focusRoomLinkedMatch,
    focusRunningMatch,
    markLiveMatchMounted,
  };
}
