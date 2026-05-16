import { useEffect } from 'react';
import { rgPerfMark } from '@/utils/rgPerfTrace';

const mountedTabKeys = new Set<string>();

export function useTabWarmupTrace(tab: string) {
  useEffect(() => {
    if (mountedTabKeys.has(tab)) {
      rgPerfMark('tab warm path reused', {
        source: 'tab screen mount',
        tab,
      });
      return undefined;
    }

    mountedTabKeys.add(tab);
    rgPerfMark('tab first mount begin', {
      source: 'tab screen mount',
      tab,
    });

    const readyTimeoutId = setTimeout(() => {
      rgPerfMark('tab first mount end', {
        source: 'tab screen mount',
        tab,
      });
    }, 0);

    return () => {
      clearTimeout(readyTimeoutId);
    };
  }, [tab]);
}
