import { memo } from 'react';
import type { ComponentProps } from 'react';
import { LiveMatchContainer } from '@/features/runs/components/LiveMatchContainer';
import { areLiveMatchContainerPropsEqual } from '@/features/runs/components/liveMatchPager/liveMatchPagePropsComparator';
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

type ReadyRunShellKind = Extract<TrackRunShellKind, 'idle' | 'lobby'>;

export const ReadyRunShell = memo(function ReadyRunShell({
  shellKind,
  readyScreenProps,
}: {
  shellKind: ReadyRunShellKind;
  readyScreenProps: ComponentProps<typeof RunningReadyScreen>;
}) {
  useTrackRunShellDiagnostics(shellKind);
  useReadyRunShellMountTrace(shellKind);

  return <RunningReadyScreen {...readyScreenProps} />;
}, (prevProps, nextProps) => (
  prevProps.shellKind === nextProps.shellKind
  && prevProps.readyScreenProps === nextProps.readyScreenProps
));

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
}, (prevProps, nextProps) => (
  prevProps.liveMatchKey === nextProps.liveMatchKey
  && areLiveMatchContainerPropsEqual(prevProps.liveContainerProps, nextProps.liveContainerProps)
));

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

  return <ReadyRunShell shellKind={shellKind} readyScreenProps={readyScreenProps} />;
}, (prevProps, nextProps) => {
  if (
    prevProps.shellKind !== nextProps.shellKind
    || prevProps.liveMatchKey !== nextProps.liveMatchKey
  ) {
    return false;
  }

  if (nextProps.shellKind === 'live') {
    return areLiveMatchContainerPropsEqual(prevProps.liveContainerProps, nextProps.liveContainerProps);
  }

  return prevProps.readyScreenProps === nextProps.readyScreenProps;
});
