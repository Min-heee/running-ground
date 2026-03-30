import { useState } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';

export default function NotificationSettingsScreen() {
  const [friendAlerts, setFriendAlerts] = useState(true);
  const [districtAlerts, setDistrictAlerts] = useState(true);
  const [marketAlerts, setMarketAlerts] = useState(false);

  return (
    <Screen>
      <AuthHeader title="알림 설정" subtitle="친구 경쟁, 지역 경쟁, 마켓 관련 알림을 관리할 수 있어." />

      <Card>
        <View style={styles.list}>
          <ToggleRow label="친구 요청 및 수락 알림" active={friendAlerts} onPress={() => setFriendAlerts((prev) => !prev)} />
          <ToggleRow label="지역 경쟁 순위 변동 알림" active={districtAlerts} onPress={() => setDistrictAlerts((prev) => !prev)} />
          <ToggleRow label="마켓/리워드 소식 알림" active={marketAlerts} onPress={() => setMarketAlerts((prev) => !prev)} />
        </View>
      </Card>

      <PrimaryButton label="알림 설정 저장" />
    </Screen>
  );
}

function ToggleRow({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.row, active && styles.rowActive]} onPress={onPress}>
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
});
