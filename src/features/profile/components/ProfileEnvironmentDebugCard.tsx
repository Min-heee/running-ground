import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/SectionTitle';
import type { MyProfileResponse } from '@/lib/api/types';
import { getRgEnvironmentInfo } from '@/utils/rgEnvTrace';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type ProfileEnvironmentDebugCardProps = {
  profile: MyProfileResponse | null;
};

type EnvironmentDebugRow = readonly [string, string];

const ProfileEnvironmentDebugRow = memo(function ProfileEnvironmentDebugRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text selectable style={styles.value}>{value}</Text>
    </View>
  );
});

export function ProfileEnvironmentDebugCard({ profile }: ProfileEnvironmentDebugCardProps) {
  const environmentInfo = useMemo(() => getRgEnvironmentInfo(profile), [profile]);
  const rows = useMemo<EnvironmentDebugRow[]>(() => [
    ['EXPO_PUBLIC_API_BASE_URL', environmentInfo.apiBaseUrl],
    ['EXPO_PUBLIC_USE_MOCK_API', environmentInfo.mockApi],
    ['appVariant', environmentInfo.appVariant],
    ['bundle/package id', environmentInfo.appIdentifier],
    ['platform', environmentInfo.platform],
    ['userId', environmentInfo.userId],
    ['nickname', environmentInfo.userNickname],
  ], [environmentInfo]);
  const rowElements = useMemo(() => rows.map(([label, value]) => (
    <ProfileEnvironmentDebugRow key={label} label={label} value={value} />
  )), [rows]);

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
        {rowElements}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: radii.pill,
    backgroundColor: colors.brandWash,
    color: colors.brandStrong,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.extraBold,
    overflow: 'hidden',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.sm,
  },
  card: {
    gap: spacing.s12,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.s12,
    justifyContent: 'space-between',
  },
  helper: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    lineHeight: 18,
  },
  label: {
    color: colors.textSecondary,
    flexShrink: 0,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.extraBold,
    letterSpacing: 0.2,
    width: 145,
  },
  row: {
    alignItems: 'flex-start',
    borderTopColor: colors.borderSoft,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.s10,
    paddingVertical: spacing.xxl,
  },
  rows: {
    gap: 0,
  },
  value: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    lineHeight: 18,
  },
});
