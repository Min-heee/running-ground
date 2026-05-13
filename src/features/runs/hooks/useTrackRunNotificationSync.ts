import { useEffect, useRef } from 'react';
import type { UpcomingRunningMatchItem } from '@/lib/api/types';
import { fetchNotificationSettings } from '@/services';
import { syncScheduledMatchNotifications } from '@/lib/matchNotifications';

type UseTrackRunNotificationSyncInput = {
  upcomingMatches: UpcomingRunningMatchItem[];
  matchRemindersEnabled: boolean;
  onMatchRemindersEnabledChange: (enabled: boolean) => void;
};

export function useTrackRunNotificationSync({
  upcomingMatches,
  matchRemindersEnabled,
  onMatchRemindersEnabledChange,
}: UseTrackRunNotificationSyncInput) {
  const onMatchRemindersEnabledChangeRef = useRef(onMatchRemindersEnabledChange);
  onMatchRemindersEnabledChangeRef.current = onMatchRemindersEnabledChange;

  useEffect(() => {
    let canceled = false;

    void fetchNotificationSettings()
      .then((settings) => {
        if (!canceled) {
          onMatchRemindersEnabledChangeRef.current(settings.matchReminders);
        }
      })
      .catch(() => {
        if (!canceled) {
          onMatchRemindersEnabledChangeRef.current(true);
        }
      });

    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    void syncScheduledMatchNotifications(upcomingMatches, matchRemindersEnabled);
  }, [matchRemindersEnabled, upcomingMatches]);
}
