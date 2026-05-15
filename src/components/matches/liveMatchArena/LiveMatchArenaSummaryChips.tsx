import { memo, useMemo } from 'react';
import { Text, View } from 'react-native';
import { areStringArraysEqual } from '@/components/matches/liveMatchArena/helpers';
import { liveMatchArenaStyles as styles } from '@/components/matches/liveMatchArena/styles';

const SummaryChip = memo(function SummaryChip({ label }: { label: string }) {
  return (
    <View style={styles.summaryChip}>
      <Text style={styles.summaryChipText}>{label}</Text>
    </View>
  );
});

export const LiveMatchArenaSummaryChips = memo(function LiveMatchArenaSummaryChips({
  chips,
}: {
  chips: string[];
}) {
  const summaryChipItems = useMemo(
    () => chips.map((chip) => <SummaryChip key={chip} label={chip} />),
    [chips],
  );

  return (
    <View style={styles.summaryChipRow}>
      {summaryChipItems}
    </View>
  );
}, (prevProps, nextProps) => areStringArraysEqual(prevProps.chips, nextProps.chips));
