import { useMatchProgressSync } from '@/features/runs/hooks/useMatchProgressSync';

type UseMatchProgressHeartbeatInput = Parameters<typeof useMatchProgressSync>[0];

export function useMatchProgressHeartbeat(input: UseMatchProgressHeartbeatInput) {
  return useMatchProgressSync(input);
}
