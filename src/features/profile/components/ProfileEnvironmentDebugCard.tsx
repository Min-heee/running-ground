import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/SectionTitle';
import type { MyProfileResponse } from '@/lib/api/types';
import { getRgEnvironmentInfo } from '@/utils/rgEnvTrace';

type ProfileEnvironmentDebugCardProps = {
  profile: MyProfileResponse | null;
};

export function ProfileEnvironmentDebugCard({ profile }: ProfileEnvironmentDebugCardProps) {
  const environmentInfo = getRgEnvironmentInfo(profile);
  const rows = [
    ['EXPO_PUBLIC_API_BASE_URL', environmentInfo.apiBaseUrl],
    ['EXPO_PUBLIC_USE_MOCK_API', environmentInfo.mockApi],
    ['appVariant', environmentInfo.appVariant],
    ['bundle/package id', environmentInfo.appIdentifier],
    ['platform', environmentInfo.platform],
    ['userId', environmentInfo.userId],
    ['nickname', environmentInfo.userNickname],
  ] as const;

  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <SectionTitle>개발자 환경</SectionTitle>
        <Text style={styles.badge}>DEBUG</Text>
      </View>
      <Text style={styles.helper}>
        TestFlight와 Android dev 앱이 같은 API를 보는지 확인하는 숨김 정보예요.
      </Text>
      <View style={styles.rows}>
        {rows.map(([label, value]) => (
          <View key={label} style={styles.row}>
            <Text style={styles.label}>{label}</Text>
            <Text selectable style={styles.value}>{value}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
    color: '#4F46E5',
    fontSize: 11,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  card: {
    gap: 12,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  helper: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },
  label: {
    color: '#667085',
    flexShrink: 0,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
    width: 145,
  },
  row: {
    alignItems: 'flex-start',
    borderTopColor: '#EAECF0',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
  },
  rows: {
    gap: 0,
  },
  value: {
    color: '#111827',
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
});
