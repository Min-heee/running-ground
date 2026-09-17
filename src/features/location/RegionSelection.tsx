import { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AddressRegionNode } from './addressCatalog';
import { colors, fixedColors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

export function buildRegionSelectionState(
  regions: AddressRegionNode[],
  provinceName: string,
  secondaryRegionName: string,
  tertiaryRegionName: string,
) {
  const selectedProvince = regions.find((region) => region.name === provinceName) ?? null;
  const secondaryOptions = selectedProvince?.children ?? [];
  const selectedSecondary = secondaryOptions.find((region) => region.name === secondaryRegionName) ?? null;
  const tertiaryOptions = selectedSecondary?.children ?? [];
  const selectedTertiary = tertiaryOptions.find((region) => region.name === tertiaryRegionName) ?? null;
  const finalRegion = tertiaryOptions.length > 0 ? selectedTertiary : selectedSecondary;
  const finalDistrictName = finalRegion?.name ?? '';
  const finalCityName = selectedSecondary?.type === 'city' ? selectedSecondary.name : '';
  const selectedAddressLabel = [provinceName, secondaryRegionName, tertiaryRegionName].filter(Boolean).join(' ');

  return {
    selectedProvince,
    secondaryOptions,
    selectedSecondary,
    tertiaryOptions,
    selectedTertiary,
    finalRegion,
    finalCityName,
    finalDistrictName,
    selectedAddressLabel,
  };
}

// 2단계 픽커 제목용 자식 종별 라벨. 첫 자식의 type만 보면 하이브리드 시·도
// (전남광주통합특별시: 구와 시·군이 한 목록에 공존)에서 라벨이 틀리므로 전체를 본다.
export function getSecondaryRegionKindLabel(children: AddressRegionNode[] | null | undefined): string {
  const options = children ?? [];
  const hasDistrict = options.some((option) => option.type === 'district');
  const hasCity = options.some((option) => option.type === 'city');

  if (hasDistrict && hasCity) {
    return '시/군/구';
  }

  return hasDistrict ? '구' : '시/군';
}

export function RegionChipSection({
  title,
  options,
  selectedName,
  disabled,
  onSelect,
}: {
  title: string;
  options: AddressRegionNode[];
  selectedName: string;
  disabled?: boolean;
  onSelect: (option: AddressRegionNode) => void;
}) {
  const chips = useMemo(() => options.map((option) => (
    <RegionChip
      key={option.name}
      disabled={disabled}
      onSelect={onSelect}
      option={option}
      selected={option.name === selectedName}
    />
  )), [disabled, onSelect, options, selectedName]);

  return (
    <View style={styles.selectionSection}>
      <Text style={styles.selectionTitle}>{title}</Text>
      <View style={styles.selectionList}>
        {chips}
      </View>
    </View>
  );
}

const RegionChip = memo(function RegionChip({
  disabled,
  onSelect,
  option,
  selected,
}: {
  disabled?: boolean;
  onSelect: (option: AddressRegionNode) => void;
  option: AddressRegionNode;
  selected: boolean;
}) {
  const handleSelect = useCallback(() => {
    onSelect(option);
  }, [onSelect, option]);

  return (
    <Pressable
      // 저장 중에도 **고른 칩은 흐리지 않는다**: 보라 칩에 opacity 0.6이 얹히면 흰 글씨가 2.4:1로
      // 무너져, '무엇을 저장 중인지' 보여주는 그 칩이 제일 안 읽힌다. 잠금 신호는 나머지 칩이 맡는다.
      style={[styles.selectionChip, selected && styles.selectionChipSelected, disabled && !selected && styles.disabledButton]}
      onPress={handleSelect}
      disabled={disabled}
    >
      <Text style={[styles.selectionChipText, selected && styles.selectionChipTextSelected]}>{option.name}</Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  selectionSection: {
    gap: spacing.s10,
  },
  selectionTitle: {
    color: colors.textPrimary,
    fontWeight: fontWeights.bold,
    fontSize: fontSizes.rank,
  },
  selectionList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xxl,
  },
  selectionChip: {
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s10,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  selectionChipSelected: {
    // 선택 = 브랜드 솔리드 + 흰 글씨 고정 짝 (오너 2026-09-18: 검은 알약을 보라로 통일 — SegmentSwitch와 같은 언어).
    backgroundColor: fixedColors.brand,
    borderColor: fixedColors.brand,
  },
  selectionChipText: {
    color: colors.textMuted,
    fontWeight: fontWeights.bold,
  },
  selectionChipTextSelected: {
    color: fixedColors.white,
  },
  disabledButton: {
    opacity: 0.6,
  },
});
