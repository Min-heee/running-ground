import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/SectionTitle';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';

type ProfileSettingsCardProps = {
  onDebugUnlockPress?: () => void;
};

export function ProfileSettingsCard({ onDebugUnlockPress }: ProfileSettingsCardProps) {
  return (
    <Card style={styles.settingsCard}>
      <View style={styles.sectionHeaderRow}>
        <SectionTitle>설정</SectionTitle>
        <Pressable
          accessibilityLabel="설정 항목 수"
          hitSlop={8}
          onPress={onDebugUnlockPress}
        >
          <Text style={styles.sectionLink}>3개</Text>
        </Pressable>
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
    gap: spacing.s12,
  },
  sectionLink: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  settingsCard: {
    gap: 0,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.s12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSoft,
  },
  settingLabel: {
    color: colors.textPrimary,
    fontWeight: fontWeights.bold,
  },
  settingValue: {
    color: colors.textSecondary,
    fontWeight: fontWeights.bold,
  },
});
