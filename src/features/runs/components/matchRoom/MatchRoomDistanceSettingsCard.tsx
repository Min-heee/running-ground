import { memo, useCallback, useMemo, useState } from 'react';
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
  const isCustomDistance = useMemo(() => !MATCH_ROOM_DISTANCE_OPTIONS.some(
    (optionKm) => Math.abs(distanceKm - optionKm) < 0.15,
  ), [distanceKm]);
  const [showCustomDistanceInput, setShowCustomDistanceInput] = useState(() => isCustomDistance);
  const handleShowCustomDistanceInput = useCallback(() => {
    setShowCustomDistanceInput(true);
  }, []);
  const handleHideCustomDistanceInput = useCallback(() => {
    setShowCustomDistanceInput(false);
  }, []);
  const distanceChips = useMemo(() => MATCH_ROOM_DISTANCE_OPTIONS.map((optionKm) => (
    <DistanceOptionChip
      key={`room-distance-${optionKm}`}
      optionKm={optionKm}
      selected={Math.abs(distanceKm - optionKm) < 0.15}
      saving={saving}
      onDistanceChange={onDistanceChange}
      onHideCustomDistanceInput={handleHideCustomDistanceInput}
    />
  )), [distanceKm, handleHideCustomDistanceInput, onDistanceChange, saving]);

  return (
    <Card>
      <Text style={styles.sectionTitle}>거리 설정</Text>
      <View style={styles.distanceWrap}>
        {distanceChips}
        <CustomDistanceChip
          selected={showCustomDistanceInput}
          saving={saving}
          onPress={handleShowCustomDistanceInput}
        />
      </View>
      {showCustomDistanceInput ? (
        <CustomDistanceInputRow
          customDistanceText={customDistanceText}
          saving={saving}
          onApplyCustomDistance={onApplyCustomDistance}
          onCustomDistanceTextChange={onCustomDistanceTextChange}
        />
      ) : null}
    </Card>
  );
}

const CustomDistanceInputRow = memo(function CustomDistanceInputRow({
  customDistanceText,
  onApplyCustomDistance,
  onCustomDistanceTextChange,
  saving,
}: {
  customDistanceText: string;
  onApplyCustomDistance: () => void;
  onCustomDistanceTextChange: (value: string) => void;
  saving: boolean;
}) {
  return (
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
  );
});

const DistanceOptionChip = memo(function DistanceOptionChip({
  onDistanceChange,
  onHideCustomDistanceInput,
  optionKm,
  saving,
  selected,
}: {
  onDistanceChange: (distanceKm: number) => void;
  onHideCustomDistanceInput: () => void;
  optionKm: number;
  saving: boolean;
  selected: boolean;
}) {
  const handlePress = useCallback(() => {
    onDistanceChange(optionKm);
    onHideCustomDistanceInput();
  }, [onDistanceChange, onHideCustomDistanceInput, optionKm]);

  return (
    <DistanceChip
      label={`${optionKm}km`}
      selected={selected}
      saving={saving}
      onPress={handlePress}
    />
  );
});

const CustomDistanceChip = memo(function CustomDistanceChip({
  onPress,
  saving,
  selected,
}: {
  onPress: () => void;
  saving: boolean;
  selected: boolean;
}) {
  return (
    <DistanceChip
      label="직접입력"
      selected={selected}
      saving={saving}
      onPress={onPress}
    />
  );
});

const DistanceChip = memo(function DistanceChip({
  label,
  onPress,
  saving,
  selected,
}: {
  label: string;
  onPress: () => void;
  saving: boolean;
  selected: boolean;
}) {
  const chipStyle = useMemo(() => [
    styles.distanceChip,
    selected ? styles.distanceChipSelected : undefined,
  ], [selected]);
  const chipTextStyle = useMemo(() => [
    styles.distanceChipText,
    selected ? styles.distanceChipTextSelected : undefined,
  ], [selected]);

  return (
    <Pressable
      style={chipStyle}
      onPress={onPress}
      disabled={saving}
    >
      <Text style={chipTextStyle}>{label}</Text>
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
