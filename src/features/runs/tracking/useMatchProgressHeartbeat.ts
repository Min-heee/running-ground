import { useMatchProgressSync } from '@/features/runs/sync/useMatchProgressSync';

type UseMatchProgressHeartbeatInput = Parameters<typeof useMatchProgressSync>[0];

export function useMatchProgressHeartbeat(input: UseMatchProgressHeartbeatInput) {
  return useMatchProgressSync(input);
}
