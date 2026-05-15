import { useRunTrackingFlow } from '@/features/runs/hooks/useRunTrackingFlow';

type UseTrackRunRuntimeShareStateInput = Parameters<typeof useRunTrackingFlow>[0];

export function useTrackRunRuntimeShareState(input: UseTrackRunRuntimeShareStateInput) {
  return useRunTrackingFlow(input);
}
