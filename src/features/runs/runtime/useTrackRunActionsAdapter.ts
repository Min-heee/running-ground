import { useEffect } from 'react';
import { useRunActionHandlers } from '@/features/runs/hooks/useRunActionHandlers';
import { rgPerfMark } from '@/utils/rgPerfTrace';

type UseTrackRunActionsAdapterInput = Parameters<typeof useRunActionHandlers>[0];

export function useTrackRunActionsAdapter(input: UseTrackRunActionsAdapterInput) {
  const actions = useRunActionHandlers(input);

  useEffect(() => {
    rgPerfMark('track run runtime adapter selected', {
      adapter: 'actions',
      matchMode: input.matchMode,
      source: 'track-run runtime',
    });
  }, [input.matchMode]);

  return actions;
}
