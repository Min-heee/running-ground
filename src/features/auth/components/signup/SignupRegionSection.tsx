import { Text, View } from 'react-native';
import { RegionChipSection } from '@/features/location/RegionSelection';
import { RegionPickerCard, SignupInput } from './SignupFormPrimitives';
import { signupFormStyles as styles } from './signupFormStyles';
import type { SignupFormModel } from './types';

type SignupRegionSectionProps = Pick<
  SignupFormModel,
  | 'addressDetail'
  | 'catalogLoading'
  | 'finalRegion'
  | 'handleSelectProvince'
  | 'handleSelectSecondary'
  | 'openRegionStep'
  | 'provinceName'
  | 'regions'
  | 'secondaryOptions'
  | 'secondaryRegionName'
  | 'selectedAddressLabel'
  | 'selectedProvince'
  | 'setAddressDetail'
  | 'setOpenRegionStep'
  | 'submitting'
>;

export function SignupRegionSection({
  addressDetail,
  catalogLoading,
  finalRegion,
  handleSelectProvince,
  handleSelectSecondary,
  openRegionStep,
  provinceName,
  regions,
  secondaryOptions,
  secondaryRegionName,
  selectedAddressLabel,
  selectedProvince,
  setAddressDetail,
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
          title={selectedProvince.children?.[0]?.type === 'district' ? '2. 구 선택' : '2. 시/군 선택'}
          selectedLabel={secondaryRegionName || '세부 지역을 선택해주세요'}
          active={openRegionStep === 'secondary'}
          disabled={submitting || catalogLoading}
          onPress={() => setOpenRegionStep('secondary')}
        >
          <RegionChipSection
            title={selectedProvince.children?.[0]?.type === 'district' ? '구 목록' : '시/군 목록'}
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

      {finalRegion ? (
        <SignupInput
          label="상세 주소"
          placeholder="예: 테헤란로 123, 101동 1203호"
          value={addressDetail}
          onChangeText={setAddressDetail}
          editable={!submitting}
        />
      ) : null}
    </View>
  );
}
