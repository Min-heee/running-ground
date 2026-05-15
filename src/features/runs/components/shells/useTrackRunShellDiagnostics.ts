import { useEffect } from 'react';
import type { TrackRunShellKind } from '@/features/runs/components/shells/TrackRunShellTypes';
import { rgPerfMark } from '@/utils/rgPerfTrace';
import { useDevRenderCounter } from '@/utils/useDevRenderCounter';

export function useTrackRunShellDiagnostics(shellKind: TrackRunShellKind) {
  useDevRenderCounter(
    shellKind === 'idle'
      ? 'IdleRunShell'
      : shellKind === 'lobby'
        ? 'MatchLobbyShell'
        : 'LiveMatchShell',
  );

  useEffect(() => {
    rgPerfMark('track run shell selected', {
      shell: shellKind,
      source: 'track-run view',
    });
  }, [shellKind]);
}
