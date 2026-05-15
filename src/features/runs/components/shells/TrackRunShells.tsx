import { memo } from 'react';
import type { ComponentProps } from 'react';
import { LiveMatchContainer } from '@/features/runs/components/LiveMatchContainer';
import { RunningReadyScreen } from '@/features/runs/components/RunningReadyScreen';
import type { TrackRunShellKind } from '@/features/runs/components/shells/TrackRunShellTypes';
import { useLiveMatchShellMountTrace } from '@/features/runs/components/shells/useLiveMatchShellMountTrace';
import { useReadyRunShellMountTrace } from '@/features/runs/components/shells/useReadyRunShellMountTrace';
import { useTrackRunShellDiagnostics } from '@/features/runs/components/shells/useTrackRunShellDiagnostics';
export type { TrackRunShellKind } from '@/features/runs/components/shells/TrackRunShellTypes';

type TrackRunShellRouterProps = {
  liveContainerProps: ComponentProps<typeof LiveMatchContainer>;
  liveMatchKey: string | null;
  readyScreenProps: ComponentProps<typeof RunningReadyScreen>;
  shellKind: TrackRunShellKind;
};

export const IdleRunShell = memo(function IdleRunShell({
  readyScreenProps,
}: {
  readyScreenProps: ComponentProps<typeof RunningReadyScreen>;
}) {
  useTrackRunShellDiagnostics('idle');
  useReadyRunShellMountTrace('idle');

  return <RunningReadyScreen {...readyScreenProps} />;
});

export const MatchLobbyShell = memo(function MatchLobbyShell({
  readyScreenProps,
}: {
  readyScreenProps: ComponentProps<typeof RunningReadyScreen>;
}) {
  useTrackRunShellDiagnostics('lobby');
  useReadyRunShellMountTrace('lobby');

  return <RunningReadyScreen {...readyScreenProps} />;
});

export const LiveMatchShell = memo(function LiveMatchShell({
  liveContainerProps,
  liveMatchKey,
}: {
  liveContainerProps: ComponentProps<typeof LiveMatchContainer>;
  liveMatchKey: string | null;
}) {
  useTrackRunShellDiagnostics('live');
  useLiveMatchShellMountTrace(liveMatchKey);

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
}, (prevProps, nextProps) => {
  if (
    prevProps.shellKind !== nextProps.shellKind
    || prevProps.liveMatchKey !== nextProps.liveMatchKey
  ) {
    return false;
  }

  if (nextProps.shellKind === 'live') {
    return prevProps.liveContainerProps === nextProps.liveContainerProps;
  }

  return prevProps.readyScreenProps === nextProps.readyScreenProps;
});
