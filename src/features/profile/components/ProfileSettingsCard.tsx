import { Link } from 'expo-router';
import { openBrowserAsync } from 'expo-web-browser';
import { useCallback } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/SectionTitle';
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '@/config/legal';
import { isAppleHealthModuleAvailable } from '@/integrations/appleHealthAvailability';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';

// Discoverability (App Store 2.5.1 root cause): the reviewer could not find
// the HealthKit UI from the app's surface, so the settings row that opens
// 기록 연동 관리 must NAME the health integration it manages. Availability-
// gated: 'Apple Health'만 언급 when the RunnigappAppleHealth native reader
// exists in this binary (build 49+); the HealthKit-free build 48 keeps today's
// bare row from the same OTA'd JS. Android names 헬스 커넥트.
function getIntegrationRowDescription(): string | null {
  if (Platform.OS === 'ios') {
    return isAppleHealthModuleAvailable() ? 'Apple Health 러닝 기록 가져오기·연동 관리' : null;
  }

  if (Platform.OS === 'android') {
    return '헬스 커넥트 러닝 기록 가져오기·연동 관리';
  }

  return null;
}

type ProfileSettingsCardProps = {
  onDebugUnlockPress?: () => void;
};

export function ProfileSettingsCard({ onDebugUnlockPress }: ProfileSettingsCardProps) {
  const integrationRowDescription = getIntegrationRowDescription();
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
          <View style={styles.settingLabelBlock}>
            <Text style={styles.settingLabel}>기록 연동 관리</Text>
            {integrationRowDescription ? (
              <Text style={styles.settingDescription}>{integrationRowDescription}</Text>
            ) : null}
          </View>
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
  settingLabelBlock: {
    flex: 1,
    gap: spacing.xxs,
    paddingRight: spacing.s10,
  },
  settingLabel: {
    color: colors.textPrimary,
    fontWeight: fontWeights.bold,
  },
  settingDescription: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 18,
  },
  settingValue: {
    color: colors.textSecondary,
    fontWeight: fontWeights.bold,
  },
});
