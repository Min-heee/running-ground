import { useTrackRunActionsAdapter } from '@/features/runs/runtime/useTrackRunActionsAdapter';

type UseTrackRunRuntimeActionsInput = Parameters<typeof useTrackRunActionsAdapter>[0];

export function useTrackRunRuntimeActions(input: UseTrackRunRuntimeActionsInput) {
  return useTrackRunActionsAdapter(input);
}
