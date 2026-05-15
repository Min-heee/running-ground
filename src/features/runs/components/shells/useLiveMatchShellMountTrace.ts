import { useEffect } from 'react';
import { rgPerfMark } from '@/utils/rgPerfTrace';

export function useLiveMatchShellMountTrace(liveMatchKey: string | null) {
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
}
