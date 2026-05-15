import { FlatList, Platform, Text, View } from 'react-native';
import { memo, useCallback } from 'react';
import type { ListRenderItem } from 'react-native';
import { RaceBoardListRow } from '@/components/matches/liveMatchRaceBoard/RaceBoardListRow';
import { liveMatchRaceBoardStyles as styles } from '@/components/matches/liveMatchRaceBoard/styles';
import type { LiveMatchRaceBoardRow } from '@/components/matches/liveMatchRaceBoard/types';

export type { LiveMatchRaceBoardRow };

const RACE_BOARD_ROW_HEIGHT = 104;

export const LiveMatchRaceBoard = memo(function LiveMatchRaceBoard({
  title,
  subtitle,
  rows,
}: {
  title: string;
  subtitle: string;
  rows: LiveMatchRaceBoardRow[];
}) {
  const renderRaceBoardRow = useCallback<ListRenderItem<LiveMatchRaceBoardRow>>(({ item }) => (
    <RaceBoardListRow row={item} />
  ), []);
  const keyExtractor = useCallback((row: LiveMatchRaceBoardRow) => row.id, []);
  const getItemLayout = useCallback((_: ArrayLike<LiveMatchRaceBoardRow> | null | undefined, index: number) => ({
    length: RACE_BOARD_ROW_HEIGHT + 14,
    offset: (RACE_BOARD_ROW_HEIGHT + 14) * index,
    index,
  }), []);

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>RACE BOARD</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <FlatList
        style={styles.rowsScroller}
        contentContainerStyle={styles.rows}
        data={rows}
        renderItem={renderRaceBoardRow}
        keyExtractor={keyExtractor}
        getItemLayout={getItemLayout}
        initialNumToRender={Platform.OS === 'android' ? 5 : 8}
        maxToRenderPerBatch={Platform.OS === 'android' ? 5 : 8}
        windowSize={Platform.OS === 'android' ? 5 : 9}
        removeClippedSubviews={Platform.OS === 'android'}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      />
    </View>
  );
});
