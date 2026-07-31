import { useEffect, useState } from 'react';
import { ensureMatchReminderPermissions, syncScheduledMatchNotifications } from '@/lib/matchNotifications';
import { fetchNotificationSettings, fetchUpcomingRunningMatches, getApiErrorMessage, updateNotificationSettings } from '@/services';
import { applyLiveRunSettings } from '@/features/runs/cheer/liveRunSettingsStore';

export function useNotificationSettings() {
  const [friendAlerts, setFriendAlerts] = useState(true);
  const [districtAlerts, setDistrictAlerts] = useState(true);
  const [marketAlerts, setMarketAlerts] = useState(false);
  const [matchReminders, setMatchReminders] = useState(true);
  // 라이브 러닝 공개 + 응원 메시지 수신 (오너 2026-07-31) — 기본 켬.
  const [liveRunPublic, setLiveRunPublic] = useState(true);
  const [cheerAlerts, setCheerAlerts] = useState(true);
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
        setLiveRunPublic(settings.liveRunPublic !== false);
        setCheerAlerts(settings.cheerAlerts !== false);
        applyLiveRunSettings(settings);
      })
      .catch((loadError) => {
        setError(getApiErrorMessage(loadError, '알림 설정을 불러오지 못했어요.'));
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
          throw new Error('기기 알림 권한을 허용해야 예약 매치 알림을 켤 수 있어요.');
        }
      }

      const settings = await updateNotificationSettings({
        friendAlerts,
        districtAlerts,
        marketAlerts,
        matchReminders,
        liveRunPublic,
        cheerAlerts,
      });
      const upcomingMatches = await fetchUpcomingRunningMatches().catch(() => ({ items: [] }));
      await syncScheduledMatchNotifications(upcomingMatches.items, settings.matchReminders);

      setFriendAlerts(settings.friendAlerts);
      setDistrictAlerts(settings.districtAlerts);
      setMarketAlerts(settings.marketAlerts);
      setMatchReminders(settings.matchReminders);
      setLiveRunPublic(settings.liveRunPublic !== false);
      setCheerAlerts(settings.cheerAlerts !== false);
      // 저장 즉시 러닝 파이프에도 반영 — 다음 하트비트부터 새 설정으로 나간다.
      applyLiveRunSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, '알림 설정 저장에 실패했어요.'));
    } finally {
      setSaving(false);
    }
  };

  return {
    cheerAlerts,
    districtAlerts,
    error,
    friendAlerts,
    handleSave,
    liveRunPublic,
    loading,
    marketAlerts,
    matchReminders,
    saved,
    saving,
    setCheerAlerts,
    setDistrictAlerts,
    setFriendAlerts,
    setLiveRunPublic,
    setMarketAlerts,
    setMatchReminders,
  };
}
