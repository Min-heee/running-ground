import { memo, useEffect } from 'react';
import type { ComponentProps } from 'react';
import { LiveMatchContainer } from '@/features/runs/components/LiveMatchContainer';
import { RunningReadyScreen } from '@/features/runs/components/RunningReadyScreen';
import { rgPerfMark } from '@/utils/rgPerfTrace';
import { useDevRenderCounter } from '@/utils/useDevRenderCounter';

export type TrackRunShellKind = 'idle' | 'lobby' | 'live';

type TrackRunShellRouterProps = {
  liveContainerProps: ComponentProps<typeof LiveMatchContainer>;
  liveMatchKey: string | null;
  readyScreenProps: ComponentProps<typeof RunningReadyScreen>;
  shellKind: TrackRunShellKind;
};

function useTrackRunShellDiagnostics(shellKind: TrackRunShellKind) {
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

const IdleRunShell = memo(function IdleRunShell({
  readyScreenProps,
}: {
  readyScreenProps: ComponentProps<typeof RunningReadyScreen>;
}) {
  useTrackRunShellDiagnostics('idle');

  useEffect(() => {
    rgPerfMark('idle shell mounted', {
      source: 'track-run shell',
    });
    rgPerfMark('track run shell prevented cross-state subscription', {
      prevented: 'lobby/live',
      shell: 'idle',
      source: 'track-run shell',
    });
  }, []);

  return <RunningReadyScreen {...readyScreenProps} />;
});

const MatchLobbyShell = memo(function MatchLobbyShell({
  readyScreenProps,
}: {
  readyScreenProps: ComponentProps<typeof RunningReadyScreen>;
}) {
  useTrackRunShellDiagnostics('lobby');

  useEffect(() => {
    rgPerfMark('lobby shell mounted', {
      source: 'track-run shell',
    });
    rgPerfMark('track run shell prevented cross-state subscription', {
      prevented: 'live',
      shell: 'lobby',
      source: 'track-run shell',
    });
  }, []);

  return <RunningReadyScreen {...readyScreenProps} />;
});

const LiveMatchShell = memo(function LiveMatchShell({
  liveContainerProps,
  liveMatchKey,
}: {
  liveContainerProps: ComponentProps<typeof LiveMatchContainer>;
  liveMatchKey: string | null;
}) {
  useTrackRunShellDiagnostics('live');

  useEffect(() => {
    rgPerfMark('live shell mounted', {
      key: liveMatchKey,
      source: 'track-run shell',
    });
    rgPerfMark('track run shell prevented cross-state subscription', {
      prevented: 'idle/lobby',
      shell: 'live',
      source: 'track-run shell',
    });
    rgPerfMark('live match key stable', {
      key: liveMatchKey,
      source: 'track-run shell',
    });

    return () => {
      rgPerfMark('live match screen unmount', {
        key: liveMatchKey,
        source: 'track-run shell',
      });
    };
  }, [liveMatchKey]);

  return <LiveMatchContainer {...liveContainerProps} />;
});

export const TrackRunShellRouter = memo(function TrackRunShellRouter({
  liveContainerProps,
  liveMatchKey,
  readyScreenProps,
  shellKind,
}: TrackRunShellRouterProps) {
  if (shellKind === 'live') {
    return (
      <LiveMatchShell
        key={liveMatchKey ?? 'live-match-pending'}
        liveContainerProps={liveContainerProps}
        liveMatchKey={liveMatchKey}
      />
    );
  }

  if (shellKind === 'lobby') {
    return <MatchLobbyShell readyScreenProps={readyScreenProps} />;
  }

  return <IdleRunShell readyScreenProps={readyScreenProps} />;
});
