import { useEffect, useState } from 'react';
import { ensureMatchReminderPermissions, syncScheduledMatchNotifications } from '@/lib/matchNotifications';
import { fetchNotificationSettings, fetchUpcomingRunningMatches, getApiErrorMessage, updateNotificationSettings } from '@/services';

export function useNotificationSettings() {
  const [friendAlerts, setFriendAlerts] = useState(true);
  const [districtAlerts, setDistrictAlerts] = useState(true);
  const [marketAlerts, setMarketAlerts] = useState(false);
  const [matchReminders, setMatchReminders] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchNotificationSettings()
      .then((settings) => {
        setFriendAlerts(settings.friendAlerts);
        setDistrictAlerts(settings.districtAlerts);
        setMarketAlerts(settings.marketAlerts);
        setMatchReminders(settings.matchReminders);
      })
      .catch((loadError) => {
        setError(getApiErrorMessage(loadError, '알림 설정을 불러오지 못했어.'));
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setError(null);
    setSaving(true);

    try {
      if (matchReminders) {
        const hasPermission = await ensureMatchReminderPermissions();

        if (!hasPermission) {
          throw new Error('기기 알림 권한을 허용해야 예약 매치 알림을 켤 수 있어.');
        }
      }

      const settings = await updateNotificationSettings({
        friendAlerts,
        districtAlerts,
        marketAlerts,
        matchReminders,
      });
      const upcomingMatches = await fetchUpcomingRunningMatches().catch(() => ({ items: [] }));
      await syncScheduledMatchNotifications(upcomingMatches.items, settings.matchReminders);

      setFriendAlerts(settings.friendAlerts);
      setDistrictAlerts(settings.districtAlerts);
      setMarketAlerts(settings.marketAlerts);
      setMatchReminders(settings.matchReminders);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, '알림 설정 저장에 실패했어.'));
    } finally {
      setSaving(false);
    }
  };

  return {
    districtAlerts,
    error,
    friendAlerts,
    handleSave,
    loading,
    marketAlerts,
    matchReminders,
    saved,
    saving,
    setDistrictAlerts,
    setFriendAlerts,
    setMarketAlerts,
    setMatchReminders,
  };
}
