import { useEffect } from 'react';

import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import { consumeSoloCoachAutoStart, hasPendingSoloCoachAutoStart } from './soloCoachStore';

// After the 대기방 arms a coach config and navigates to the 러닝 탭, this hook
// starts the solo run automatically: flip to solo mode if needed, then fire the
// same ready action the 러닝 시작 button uses. The pending flag is consumed
// exactly once and expires after 30s, so it can only ever fire on the
// navigation it was armed for.
export function useSoloCoachAutoStart({
  isRunning,
  matchMode,
  setMatchMode,
  onReadyAction,
}: {
  isRunning: boolean;
  matchMode: RunMatchMode;
  setMatchMode: (mode: RunMatchMode) => void;
  onReadyAction: () => void;
}) {
  useEffect(() => {
    if (isRunning || !hasPendingSoloCoachAutoStart()) {
      return;
    }

    if (matchMode !== 'solo') {
      // Flip to solo first; the effect re-runs when matchMode lands on 'solo'
      // and the still-pending flag then triggers the start below.
      setMatchMode('solo');
      return;
    }

    if (consumeSoloCoachAutoStart()) {
      onReadyAction();
    }
  }, [isRunning, matchMode, onReadyAction, setMatchMode]);
}
