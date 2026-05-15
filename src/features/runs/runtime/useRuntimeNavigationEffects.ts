import { useMatchEntryEffects } from '@/features/runs/lifecycle/hooks/useMatchEntryEffects';
import { useLiveMatchNavigationEffects } from '@/features/runs/lifecycle/hooks/useLiveMatchNavigationEffects';
import { useTrackRunNotificationSync } from '@/features/runs/hooks/useTrackRunNotificationSync';
import { usePartyRunSync } from '@/features/runs/sync/usePartyRunSync';
import type { RuntimeNavigationEffectsInput } from '@/features/runs/types/runtimeEffects';

export function useRuntimeNavigationEffects({
  liveMatchNavigationEffects,
  matchEntryEffects,
  notificationSync,
  partyRunSync,
}: RuntimeNavigationEffectsInput) {
  usePartyRunSync(partyRunSync);
  useMatchEntryEffects(matchEntryEffects);
  useLiveMatchNavigationEffects(liveMatchNavigationEffects);
  useTrackRunNotificationSync(notificationSync);
}
