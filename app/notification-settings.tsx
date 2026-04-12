import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { fetchNotificationSettings, updateNotificationSettings } from '@/lib/api/services';

export default function NotificationSettingsScreen() {
  const [friendAlerts, setFriendAlerts] = useState(true);
  const [districtAlerts, setDistrictAlerts] = useState(true);
  const [marketAlerts, setMarketAlerts] = useState(false);
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
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : '알림 설정을 불러오지 못했어.');
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setError(null);
    setSaving(true);

    try {
      const settings = await updateNotificationSettings({
        friendAlerts,
        districtAlerts,
        marketAlerts,
      });

      setFriendAlerts(settings.friendAlerts);
      setDistrictAlerts(settings.districtAlerts);
      setMarketAlerts(settings.marketAlerts);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '알림 설정 저장에 실패했어.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <AuthHeader
        title="알림 설정"
        subtitle="친구 경쟁, 지역 경쟁, 마켓 관련 알림을 관리할 수 있어."
        showBack
        backHref="/(tabs)/mypage"
      />

      {loading ? <ActivityIndicator size="large" color="#6D5EF7" /> : null}

      {!loading ? (
        <>
          <Card>
            <View style={styles.list}>
              <ToggleRow label="친구 요청 및 수락 알림" active={friendAlerts} disabled={saving} onPress={() => setFriendAlerts((prev) => !prev)} />
              <ToggleRow label="지역 경쟁 순위 변동 알림" active={districtAlerts} disabled={saving} onPress={() => setDistrictAlerts((prev) => !prev)} />
              <ToggleRow label="마켓/리워드 소식 알림" active={marketAlerts} disabled={saving} onPress={() => setMarketAlerts((prev) => !prev)} />
            </View>
          </Card>

          <PrimaryButton label={saving ? '저장 중...' : '알림 설정 저장'} onPress={handleSave} />
          <SecondaryButton label="마이페이지로 돌아가기" onPress={() => router.replace('/(tabs)/mypage')} />
          {saved ? <Text style={styles.savedText}>알림 설정이 저장됐어.</Text> : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </>
      ) : null}
    </Screen>
  );
}

function ToggleRow({
  label,
  active,
  disabled,
  onPress,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.row, active && styles.rowActive, disabled && styles.rowDisabled]} onPress={onPress} disabled={disabled}>
      <View style={styles.rowMeta}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowStatus}>{active ? '켜짐' : '꺼짐'}</Text>
      </View>
      <View style={[styles.toggle, active && styles.toggleActive]}>
        <View style={[styles.knob, active && styles.knobActive]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  row: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  rowActive: {
    backgroundColor: '#F5F3FF',
    borderColor: '#C7D2FE',
  },
  rowDisabled: {
    opacity: 0.7,
  },
  rowMeta: { flex: 1, gap: 4 },
  rowLabel: {
    color: '#111827',
    fontWeight: '700',
  },
  rowStatus: {
    color: '#667085',
  },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 99,
    backgroundColor: '#D0D5DD',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  toggleActive: {
    backgroundColor: '#6D5EF7',
  },
  knob: {
    width: 20,
    height: 20,
    borderRadius: 99,
    backgroundColor: '#FFFFFF',
  },
  knobActive: {
    marginLeft: 20,
  },
  savedText: {
    color: '#067647',
    fontWeight: '700',
  },
  errorText: {
    color: '#B42318',
    fontWeight: '700',
    lineHeight: 20,
  },
});
