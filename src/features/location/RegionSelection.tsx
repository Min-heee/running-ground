import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AddressRegionNode } from './addressCatalog';

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
  return (
    <View style={styles.selectionSection}>
      <Text style={styles.selectionTitle}>{title}</Text>
      <View style={styles.selectionList}>
        {options.map((option) => {
          const selected = option.name === selectedName;

          return (
            <Pressable
              key={option.name}
              style={[styles.selectionChip, selected && styles.selectionChipSelected, disabled && styles.disabledButton]}
              onPress={() => onSelect(option)}
              disabled={disabled}
            >
              <Text style={[styles.selectionChipText, selected && styles.selectionChipTextSelected]}>{option.name}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  selectionSection: {
    gap: 10,
  },
  selectionTitle: {
    color: '#111827',
    fontWeight: '700',
    fontSize: 15,
  },
  selectionList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  selectionChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    backgroundColor: '#FFFFFF',
  },
  selectionChipSelected: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  selectionChipText: {
    color: '#475467',
    fontWeight: '700',
  },
  selectionChipTextSelected: {
    color: '#FFFFFF',
  },
  disabledButton: {
    opacity: 0.6,
  },
});
