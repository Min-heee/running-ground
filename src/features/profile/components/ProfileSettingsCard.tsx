import { Link } from 'expo-router';
import { openBrowserAsync } from 'expo-web-browser';
import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/SectionTitle';
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '@/config/legal';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';

type ProfileSettingsCardProps = {
  onDebugUnlockPress?: () => void;
};

export function ProfileSettingsCard({ onDebugUnlockPress }: ProfileSettingsCardProps) {
  const openPrivacyPolicy = useCallback(() => {
    void openBrowserAsync(PRIVACY_POLICY_URL);
  }, []);
  const openTerms = useCallback(() => {
    if (TERMS_OF_SERVICE_URL) {
      void openBrowserAsync(TERMS_OF_SERVICE_URL);
    }
  }, []);

  return (
    <Card style={styles.settingsCard}>
      <View style={styles.sectionHeaderRow}>
        <SectionTitle>설정</SectionTitle>
        <Pressable
          accessibilityLabel="설정 항목 수"
          hitSlop={8}
          onPress={onDebugUnlockPress}
        >
          <Text style={styles.sectionLink}>{TERMS_OF_SERVICE_URL ? '5개' : '4개'}</Text>
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
      <Pressable
        style={styles.settingRow}
        onPress={openPrivacyPolicy}
        accessibilityRole="link"
        accessibilityLabel="개인정보처리방침 열기"
      >
        <Text style={styles.settingLabel}>개인정보처리방침</Text>
        <Text style={styles.settingValue}>보기</Text>
      </Pressable>
      {TERMS_OF_SERVICE_URL ? (
        <Pressable
          style={styles.settingRow}
          onPress={openTerms}
          accessibilityRole="link"
          accessibilityLabel="이용약관 열기"
        >
          <Text style={styles.settingLabel}>이용약관</Text>
          <Text style={styles.settingValue}>보기</Text>
        </Pressable>
      ) : null}
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
