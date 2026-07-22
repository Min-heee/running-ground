import { useEffect } from 'react';

import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import { consumeSoloRunAutoStart, hasPendingSoloRunAutoStart } from './soloAutoStartStore';

// After a 대기방 (페이스메이커 OR 나와의 대결) arms its config and navigates to
// the 러닝 탭, this hook starts the solo run automatically: flip to solo mode
// if needed, then fire the same ready action the 러닝 시작 button uses. The
// pending flag is consumed exactly once and expires after 30s, so it can only
// ever fire on the navigation it was armed for.
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
    if (isRunning || !hasPendingSoloRunAutoStart()) {
      return;
    }

    if (matchMode !== 'solo') {
      // Flip to solo first; the effect re-runs when matchMode lands on 'solo'
      // and the still-pending flag then triggers the start below.
      setMatchMode('solo');
      return;
    }

    if (consumeSoloRunAutoStart()) {
      onReadyAction();
    }
  }, [isRunning, matchMode, onReadyAction, setMatchMode]);
}
