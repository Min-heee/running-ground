import { Text, View } from 'react-native';
import { RegionChipSection, getSecondaryRegionKindLabel } from '@/features/location/RegionSelection';
import { RegionPickerCard } from './SignupFormPrimitives';
import { signupFormStyles as styles } from './signupFormStyles';
import type { SignupFormModel } from './types';

type SignupRegionSectionProps = Pick<
  SignupFormModel,
  | 'catalogLoading'
  | 'handleSelectProvince'
  | 'handleSelectSecondary'
  | 'openRegionStep'
  | 'provinceName'
  | 'regions'
  | 'secondaryOptions'
  | 'secondaryRegionName'
  | 'selectedAddressLabel'
  | 'selectedProvince'
  | 'setOpenRegionStep'
  | 'submitting'
>;

export function SignupRegionSection({
  catalogLoading,
  handleSelectProvince,
  handleSelectSecondary,
  openRegionStep,
  provinceName,
  regions,
  secondaryOptions,
  secondaryRegionName,
  selectedAddressLabel,
  selectedProvince,
  setOpenRegionStep,
  submitting,
}: SignupRegionSectionProps) {
  return (
    <View style={styles.addressGroup}>
      <Text style={styles.label}>사는 지역 선택</Text>

      <RegionPickerCard
        title="1. 시/도 선택"
        selectedLabel={provinceName || '시/도를 선택해주세요'}
        active={openRegionStep === 'province'}
        disabled={submitting || catalogLoading}
        onPress={() => setOpenRegionStep('province')}
      >
        <RegionChipSection
          title="시/도 목록"
          options={regions}
          selectedName={provinceName}
          disabled={submitting || catalogLoading}
          onSelect={handleSelectProvince}
        />
      </RegionPickerCard>

      {selectedProvince ? (
        <RegionPickerCard
          title={`2. ${getSecondaryRegionKindLabel(selectedProvince.children)} 선택`}
          selectedLabel={secondaryRegionName || '세부 지역을 선택해주세요'}
          active={openRegionStep === 'secondary'}
          disabled={submitting || catalogLoading}
          onPress={() => setOpenRegionStep('secondary')}
        >
          <RegionChipSection
            title={`${getSecondaryRegionKindLabel(selectedProvince.children)} 목록`}
            options={secondaryOptions}
            selectedName={secondaryRegionName}
            disabled={submitting || catalogLoading}
            onSelect={handleSelectSecondary}
          />
        </RegionPickerCard>
      ) : null}

      {selectedAddressLabel ? (
        <View style={styles.selectedAddressCard}>
          <Text style={styles.selectedAddressLabel}>현재 선택</Text>
          <Text style={styles.selectedAddressValue}>{selectedAddressLabel}</Text>
        </View>
      ) : null}
    </View>
  );
}
