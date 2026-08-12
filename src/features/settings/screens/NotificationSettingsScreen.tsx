import { memo, useCallback, useMemo } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { useNotificationSettings } from '@/features/settings/hooks/useNotificationSettings';
import { colors, fixedColors, spacing, fontWeights, radii } from '@/theme/tokens';

export default function NotificationSettingsScreen() {
  const {
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
  } = useNotificationSettings();

  const handleToggleFriendAlerts = useCallback(() => {
    setFriendAlerts((prev) => !prev);
  }, [setFriendAlerts]);
  const handleToggleDistrictAlerts = useCallback(() => {
    setDistrictAlerts((prev) => !prev);
  }, [setDistrictAlerts]);
  const handleToggleMarketAlerts = useCallback(() => {
    setMarketAlerts((prev) => !prev);
  }, [setMarketAlerts]);
  const handleToggleMatchReminders = useCallback(() => {
    setMatchReminders((prev) => !prev);
  }, [setMatchReminders]);
  const handleToggleLiveRunPublic = useCallback(() => {
    setLiveRunPublic((prev) => !prev);
  }, [setLiveRunPublic]);
  const handleToggleCheerAlerts = useCallback(() => {
    setCheerAlerts((prev) => !prev);
  }, [setCheerAlerts]);
  const handleGoBackToMyPage = useCallback(() => {
    router.replace('/(tabs)/mypage');
  }, []);

  return (
    <Screen>
      <AuthHeader
        title="알림 · 라이브 설정"
        subtitle="알림과 라이브 러닝 공개·응원 수신을 관리할 수 있어요."
        showBack
        backHref="/(tabs)/mypage"
      />

      {loading ? <ActivityIndicator size="large" color={colors.brand} /> : null}

      {!loading ? (
        <>
          <Card>
            <View style={styles.list}>
              <ToggleRow label="친구 요청 및 수락 알림" active={friendAlerts} disabled={saving} onPress={handleToggleFriendAlerts} />
              <ToggleRow label="지역 경쟁 순위 변동 알림" active={districtAlerts} disabled={saving} onPress={handleToggleDistrictAlerts} />
              <ToggleRow label="마켓/리워드 소식 알림" active={marketAlerts} disabled={saving} onPress={handleToggleMarketAlerts} />
              <ToggleRow label="예약 매치 시작 알림" active={matchReminders} disabled={saving} onPress={handleToggleMatchReminders} />
              {/* 라이브 러닝 (오너 2026-07-31): 공개를 끄면 친구에게 '달리는 중'과 실시간
                  지도가 보이지 않고, 응원을 끄면 친구가 응원을 보낼 수 없다(음성도 없음). */}
              <ToggleRow label="라이브 러닝 공개 (친구에게 달리는 중 표시)" active={liveRunPublic} disabled={saving} onPress={handleToggleLiveRunPublic} />
              <ToggleRow label="응원 메시지 받기 (러닝 중 음성으로)" active={cheerAlerts} disabled={saving} onPress={handleToggleCheerAlerts} />
            </View>
          </Card>

          <PrimaryButton label={saving ? '저장 중...' : '설정 저장'} onPress={handleSave} />
          <SecondaryButton label="마이페이지로 돌아가기" onPress={handleGoBackToMyPage} />
          {saved ? <Text style={styles.savedText}>설정이 저장됐어요.</Text> : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </>
      ) : null}
    </Screen>
  );
}

const ToggleRow = memo(function ToggleRow({
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
  const rowStyle = useMemo(() => [styles.row, active && styles.rowActive, disabled && styles.rowDisabled], [active, disabled]);
  const toggleStyle = useMemo(() => [styles.toggle, active && styles.toggleActive], [active]);
  const knobStyle = useMemo(() => [styles.knob, active && styles.knobActive], [active]);

  return (
    <Pressable style={rowStyle} onPress={onPress} disabled={disabled}>
      <View style={styles.rowMeta}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowStatus}>{active ? '켜짐' : '꺼짐'}</Text>
      </View>
      <View style={toggleStyle}>
        <View style={knobStyle} />
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  list: { gap: 10 },
  row: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: radii.md,
    padding: spacing.s14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.s12,
  },
  rowActive: {
    backgroundColor: colors.purpleRow,
    borderColor: colors.brandLighter,
  },
  rowDisabled: {
    opacity: 0.7,
  },
  rowMeta: { flex: 1, gap: 4 },
  rowLabel: {
    color: colors.textPrimary,
    fontWeight: fontWeights.bold,
  },
  rowStatus: {
    color: colors.textSecondary,
  },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 99,
    backgroundColor: colors.border,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  toggleActive: {
    backgroundColor: colors.brand,
  },
  knob: {
    width: 20,
    height: 20,
    borderRadius: 99,
    backgroundColor: fixedColors.white,
  },
  knobActive: {
    marginLeft: spacing.s20,
  },
  savedText: {
    color: colors.successText,
    fontWeight: fontWeights.bold,
  },
  errorText: {
    color: colors.danger,
    fontWeight: fontWeights.bold,
    lineHeight: 20,
  },
});
