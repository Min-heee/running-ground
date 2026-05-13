import { StyleSheet, Text, View, Pressable, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { useNotificationSettings } from '@/features/settings/hooks/useNotificationSettings';

export default function NotificationSettingsScreen() {
  const {
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
  } = useNotificationSettings();

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
              <ToggleRow label="예약 매치 시작 알림" active={matchReminders} disabled={saving} onPress={() => setMatchReminders((prev) => !prev)} />
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
