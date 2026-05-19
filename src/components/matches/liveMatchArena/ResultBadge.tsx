import { memo, useMemo } from 'react';
import { Text, View } from 'react-native';
import { liveMatchArenaStyles as styles } from '@/components/matches/liveMatchArena/styles';
import type { ArenaResultLabel } from '@/components/matches/liveMatchArena/types';

type ResultBadgeProps = {
  label: ArenaResultLabel;
};

export const ResultBadge = memo(function ResultBadge({ label }: ResultBadgeProps) {
  const badgeStyle = useMemo(
    () => [
      styles.resultBadge,
      label === 'WIN'
        ? styles.resultBadgeWin
        : label === 'LOSE'
          ? styles.resultBadgeLose
          : styles.resultBadgeDraw,
    ],
    [label],
  );

  return (
    <View style={badgeStyle}>
      <Text style={styles.resultBadgeText}>{label}</Text>
    </View>
  );
});
