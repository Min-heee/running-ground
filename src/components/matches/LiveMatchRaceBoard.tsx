import { Text, View } from 'react-native';
import { memo, useMemo } from 'react';
import { RaceBoardListRow } from '@/components/matches/liveMatchRaceBoard/RaceBoardListRow';
import { liveMatchRaceBoardStyles as styles } from '@/components/matches/liveMatchRaceBoard/styles';
import type { LiveMatchRaceBoardRow } from '@/components/matches/liveMatchRaceBoard/types';

export type { LiveMatchRaceBoardRow };

export const LiveMatchRaceBoard = memo(function LiveMatchRaceBoard({
  title,
  subtitle,
  rows,
}: {
  title: string;
  subtitle: string;
  rows: LiveMatchRaceBoardRow[];
}) {
  const renderedRows = useMemo(() => rows.map((row) => (
    <RaceBoardListRow key={row.id} row={row} />
  )), [rows]);

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>RACE BOARD</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <View style={styles.rows}>{renderedRows}</View>
    </View>
  );
});
