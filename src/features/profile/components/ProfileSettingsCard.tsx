import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/SectionTitle';

export function ProfileSettingsCard() {
  return (
    <Card style={styles.settingsCard}>
      <View style={styles.sectionHeaderRow}>
        <SectionTitle>설정</SectionTitle>
        <Text style={styles.sectionLink}>3개</Text>
      </View>
      <Link href="/region-settings" asChild>
        <Pressable style={styles.settingRow}>
          <Text style={styles.settingLabel}>지역 설정</Text>
          <Text style={styles.settingValue}>변경</Text>
        </Pressable>
      </Link>
      <Link href="/notification-settings" asChild>
        <Pressable style={styles.settingRow}>
          <Text style={styles.settingLabel}>알림 설정</Text>
          <Text style={styles.settingValue}>관리</Text>
        </Pressable>
      </Link>
      <Link href="/integration-management" asChild>
        <Pressable style={styles.settingRow}>
          <Text style={styles.settingLabel}>기록 연동 관리</Text>
          <Text style={styles.settingValue}>열기</Text>
        </Pressable>
      </Link>
    </Card>
  );
}

const styles = StyleSheet.create({
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  sectionLink: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '700',
  },
  settingsCard: {
    gap: 0,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#EAECF0',
  },
  settingLabel: {
    color: '#111827',
    fontWeight: '700',
  },
  settingValue: {
    color: '#667085',
    fontWeight: '700',
  },
});
