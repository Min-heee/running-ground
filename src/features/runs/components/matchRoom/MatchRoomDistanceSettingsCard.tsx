import { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Card } from '@/components/Card';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { MATCH_ROOM_DISTANCE_OPTIONS } from '@/features/runs/utils/matchRoomScheduling';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type MatchRoomDistanceSettingsCardProps = {
  distanceKm: number;
  customDistanceText: string;
  saving: boolean;
  onDistanceChange: (distanceKm: number) => void;
  onCustomDistanceTextChange: (value: string) => void;
  onApplyCustomDistance: () => void;
};

export function MatchRoomDistanceSettingsCard({
  distanceKm,
  customDistanceText,
  saving,
  onDistanceChange,
  onCustomDistanceTextChange,
  onApplyCustomDistance,
}: MatchRoomDistanceSettingsCardProps) {
  const distanceChips = useMemo(() => MATCH_ROOM_DISTANCE_OPTIONS.map((optionKm) => (
    <DistanceOptionChip
      key={`room-distance-${optionKm}`}
      optionKm={optionKm}
      selected={Math.abs(distanceKm - optionKm) < 0.15}
      saving={saving}
      onDistanceChange={onDistanceChange}
    />
  )), [distanceKm, onDistanceChange, saving]);

  return (
    <Card>
      <Text style={styles.sectionTitle}>거리 설정</Text>
      <View style={styles.distanceWrap}>
        {distanceChips}
      </View>
      <View style={styles.customDistanceRow}>
        <TextInput
          value={customDistanceText}
          onChangeText={onCustomDistanceTextChange}
          onEndEditing={onApplyCustomDistance}
          keyboardType="decimal-pad"
          placeholder="직접 입력 예: 12.5"
          placeholderTextColor={colors.textTertiary}
          style={styles.distanceInput}
        />
        <SecondaryButton label="적용" onPress={onApplyCustomDistance} disabled={saving} />
      </View>
    </Card>
  );
}

const DistanceOptionChip = memo(function DistanceOptionChip({
  onDistanceChange,
  optionKm,
  saving,
  selected,
}: {
  onDistanceChange: (distanceKm: number) => void;
  optionKm: number;
  saving: boolean;
  selected: boolean;
}) {
  const handlePress = useCallback(() => {
    onDistanceChange(optionKm);
  }, [onDistanceChange, optionKm]);

  return (
    <Pressable
      style={[styles.distanceChip, selected ? styles.distanceChipSelected : undefined]}
      onPress={handlePress}
      disabled={saving}
    >
      <Text style={[styles.distanceChipText, selected ? styles.distanceChipTextSelected : undefined]}>
        {optionKm}km
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
  },
  distanceWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s10,
  },
  customDistanceRow: {
    flexDirection: 'row',
    gap: spacing.s10,
    alignItems: 'center',
    marginTop: spacing.s12,
  },
  distanceInput: {
    flex: 1,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s12,
    color: colors.textPrimary,
    fontWeight: fontWeights.bold,
  },
  distanceChip: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s10,
  },
  distanceChipSelected: {
    borderColor: colors.brandLight,
    backgroundColor: colors.brandWash,
  },
  distanceChipText: {
    color: colors.textStrongMuted,
    fontWeight: fontWeights.bold,
  },
  distanceChipTextSelected: {
    color: colors.brandDeep,
  },
});
