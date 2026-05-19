import { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AddressRegionNode } from './addressCatalog';
import { colors, spacing, fontWeights, radii } from '@/theme/tokens';

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
      style={[styles.selectionChip, selected && styles.selectionChipSelected, disabled && styles.disabledButton]}
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
    fontSize: 15,
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
    backgroundColor: colors.white,
  },
  selectionChipSelected: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
  },
  selectionChipText: {
    color: colors.textMuted,
    fontWeight: fontWeights.bold,
  },
  selectionChipTextSelected: {
    color: colors.white,
  },
  disabledButton: {
    opacity: 0.6,
  },
});
