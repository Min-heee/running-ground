import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { RegionChipSection, getSecondaryRegionKindLabel } from '@/features/location/RegionSelection';
import { useRegionSettings } from '@/features/settings/hooks/useRegionSettings';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

export default function RegionSettingsScreen() {
  const {
    error,
    handleSave,
    handleSelectProvince,
    handleSelectSecondary,
    loading,
    provinceName,
    regions,
    saved,
    saving,
    secondaryRegionName,
    selection,
  } = useRegionSettings();
  const {
    selectedProvince,
    secondaryOptions,
    selectedAddressLabel,
  } = selection;

  return (
    <Screen>
      <AuthHeader
        title="지역 설정"
        subtitle="내가 속한 지역을 선택하면 구 내 경쟁과 지역 배틀이 그 기준으로 반영돼요."
        showBack
        backHref="/(tabs)/mypage"
      />

      {loading ? <ActivityIndicator size="large" color={colors.brand} /> : null}

      {!loading ? (
        <>
          <Card>
            <View style={styles.list}>
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

          <PrimaryButton label={saving ? '저장 중...' : '지역 저장하기'} onPress={handleSave} />
          <SecondaryButton label="마이페이지로 돌아가기" onPress={() => router.replace('/(tabs)/mypage')} />
          {saved ? <Text style={styles.savedText}>지역이 저장됐어요.</Text> : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
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
