import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Card } from '@/components/Card';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { MATCH_ROOM_DISTANCE_OPTIONS } from '@/features/runs/utils/matchRoomScheduling';

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
  return (
    <Card>
      <Text style={styles.sectionTitle}>거리 설정</Text>
      <View style={styles.distanceWrap}>
        {MATCH_ROOM_DISTANCE_OPTIONS.map((optionKm) => {
          const isSelected = Math.abs(distanceKm - optionKm) < 0.15;
          return (
            <Pressable
              key={`room-distance-${optionKm}`}
              style={[styles.distanceChip, isSelected ? styles.distanceChipSelected : undefined]}
              onPress={() => onDistanceChange(optionKm)}
              disabled={saving}
            >
              <Text style={[styles.distanceChipText, isSelected ? styles.distanceChipTextSelected : undefined]}>
                {optionKm}km
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.customDistanceRow}>
        <TextInput
          value={customDistanceText}
          onChangeText={onCustomDistanceTextChange}
          onEndEditing={onApplyCustomDistance}
          keyboardType="decimal-pad"
          placeholder="직접 입력 예: 12.5"
          placeholderTextColor="#98A2B3"
          style={styles.distanceInput}
        />
        <SecondaryButton label="적용" onPress={onApplyCustomDistance} disabled={saving} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  distanceWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  customDistanceRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  distanceInput: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#111827',
    fontWeight: '700',
  },
  distanceChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  distanceChipSelected: {
    borderColor: '#818CF8',
    backgroundColor: '#EEF2FF',
  },
  distanceChipText: {
    color: '#344054',
    fontWeight: '700',
  },
  distanceChipTextSelected: {
    color: '#4338CA',
  },
});
