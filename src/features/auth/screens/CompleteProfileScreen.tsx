import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { useCompleteProfile } from '@/features/auth/hooks/useCompleteProfile';
import { RegionChipSection, getSecondaryRegionKindLabel } from '@/features/location/RegionSelection';
import { signOut } from '@/lib/session';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

// 소셜 로그인은 회원가입 폼을 건너뛰므로, 필수 정보(표시 이름 + 지역)를 여기서
// 받는다. 지역은 지역 랭킹·홈 지역 배틀의 전제라 건너뛰기 없음 — 저장해야 진행.
export default function CompleteProfileScreen() {
  const { next } = useLocalSearchParams<{ next?: string }>();

  const handleSaved = () => {
    // 신규 가입(welcome)은 앱 투어로, 기존 계정 보완은 홈으로.
    router.replace(next === 'welcome' ? '/welcome' : '/(tabs)/home');
  };

  const {
    displayName,
    error,
    handleSave,
    handleSelectProvince,
    handleSelectSecondary,
    loadData,
    loading,
    provinceName,
    regions,
    saving,
    secondaryRegionName,
    selection,
    setDisplayName,
  } = useCompleteProfile({ onSaved: handleSaved });
  const { selectedProvince, secondaryOptions, selectedAddressLabel } = selection;

  const handleSwitchAccount = async () => {
    await signOut();
    router.replace('/login');
  };

  return (
    <Screen>
      <AuthHeader
        title="기본 정보 설정"
        subtitle="러닝스페이스 활동에 필요한 표시 이름과 지역을 설정해주세요. 지역은 지역 랭킹과 지역 배틀의 기준이 돼요."
      />

      {loading ? <ActivityIndicator size="large" color={colors.brand} /> : null}

      {!loading && regions.length === 0 ? (
        <>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <SecondaryButton label="다시 불러오기" onPress={loadData} />
        </>
      ) : null}

      {!loading && regions.length > 0 ? (
        <>
          <Card>
            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>표시 이름</Text>
                <TextInput
                  value={displayName}
                  editable={!saving}
                  onChangeText={setDisplayName}
                  style={styles.input}
                  placeholder="러닝스페이스에서 보일 이름"
                  placeholderTextColor={colors.textTertiary}
                  maxLength={20}
                />
              </View>

              <RegionChipSection
                title="1. 시/도 선택"
                options={regions}
                selectedName={provinceName}
                disabled={saving}
                onSelect={handleSelectProvince}
              />

              {selectedProvince ? (
                <RegionChipSection
                  title={`2. ${getSecondaryRegionKindLabel(selectedProvince.children)} 선택`}
                  options={secondaryOptions}
                  selectedName={secondaryRegionName}
                  disabled={saving}
                  onSelect={handleSelectSecondary}
                />
              ) : null}

              {selectedAddressLabel ? (
                <View style={styles.selectedCard}>
                  <Text style={styles.selectedLabel}>현재 선택</Text>
                  <Text style={styles.selectedValue}>{selectedAddressLabel}</Text>
                </View>
              ) : null}
            </View>
          </Card>

          <PrimaryButton
            label={saving ? '저장 중...' : '저장하고 시작하기'}
            onPress={handleSave}
          />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </>
      ) : null}

      <SecondaryButton label="다른 계정으로 로그인" onPress={handleSwitchAccount} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.s14 },
  inputGroup: { gap: spacing.sm },
  label: {
    color: colors.textPrimary,
    fontWeight: fontWeights.bold,
    fontSize: fontSizes.rank,
  },
  input: {
    backgroundColor: colors.surfaceSubtleAlt,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: radii.md,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s14,
    color: colors.textPrimary,
  },
  selectedCard: {
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.indigoBorder,
    borderRadius: radii.md,
    padding: spacing.s14,
    gap: spacing.sm,
  },
  selectedLabel: {
    color: colors.textMuted,
    fontWeight: fontWeights.bold,
    fontSize: fontSizes.sm,
  },
  selectedValue: {
    color: colors.textPrimary,
    fontWeight: fontWeights.extraBold,
  },
  errorText: {
    color: colors.danger,
    fontWeight: fontWeights.bold,
    lineHeight: 20,
  },
});
