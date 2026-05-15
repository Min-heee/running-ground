import { useEffect } from 'react';
import type { TrackRunShellKind } from '@/features/runs/components/shells/TrackRunShellTypes';
import { rgPerfMark } from '@/utils/rgPerfTrace';

type ReadyRunShellKind = Extract<TrackRunShellKind, 'idle' | 'lobby'>;

const READY_SHELL_MOUNT_MARK: Record<ReadyRunShellKind, string> = {
  idle: 'idle shell mounted',
  lobby: 'lobby shell mounted',
};

const READY_SHELL_PREVENTED_STATE: Record<ReadyRunShellKind, string> = {
  idle: 'lobby/live',
  lobby: 'live',
};

export function useReadyRunShellMountTrace(shell: ReadyRunShellKind) {
  useEffect(() => {
    rgPerfMark(READY_SHELL_MOUNT_MARK[shell], {
      source: 'track-run shell',
    });
    rgPerfMark('track run shell prevented cross-state subscription', {
      prevented: READY_SHELL_PREVENTED_STATE[shell],
      shell,
      source: 'track-run shell',
    });
  }, [shell]);
}
