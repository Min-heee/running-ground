import { FlatList, Platform, StyleSheet, Text, View } from 'react-native';
import { memo, useCallback } from 'react';
import type { ListRenderItem } from 'react-native';

export type LiveMatchRaceBoardRow = {
  id: string;
  rank: number;
  name: string;
  paceLabel?: string;
  distanceKm: number;
  remainingKm: number;
  progress: number;
  isCurrentUser?: boolean;
  liveStatus?: 'ready' | 'running' | 'background' | 'paused' | 'disconnected' | 'forfeited' | 'finished';
};

const RACE_BOARD_ROW_HEIGHT = 104;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

const RaceBoardListRow = memo(function RaceBoardListRow({ row }: { row: LiveMatchRaceBoardRow }) {
  const isForfeited = row.liveStatus === 'forfeited';
  const rawProgress = clamp(row.progress, 0, 1);
  const lineProgressPercent = `${rawProgress * 100}%` as const;
  const dotProgressPercent = `${clamp(rawProgress, 0.04, 0.96) * 100}%` as const;
  const distanceOffsetStyle = rawProgress < 0.12
    ? styles.distanceTextNearStart
    : rawProgress > 0.88
      ? styles.distanceTextNearFinish
      : styles.distanceTextCentered;

  return (
    <View
      style={[
        styles.row,
        row.isCurrentUser ? styles.rowCurrent : undefined,
        isForfeited ? styles.rowForfeited : undefined,
      ]}
    >
      <View style={styles.nameColumn}>
        <Text style={[styles.rankText, isForfeited ? styles.rankTextForfeited : undefined]}>{row.rank}위</Text>
        <Text
          numberOfLines={2}
          style={[
            styles.nameText,
            row.isCurrentUser ? styles.nameTextCurrent : undefined,
            isForfeited ? styles.nameTextForfeited : undefined,
          ]}
        >
          {row.isCurrentUser ? '나' : row.name}
        </Text>
      </View>
      <View style={styles.trackColumn}>
        <View style={styles.trackStack}>
          <View style={styles.trackLine}>
            <View
              style={[
                styles.trackProgress,
                row.isCurrentUser ? styles.trackProgressCurrent : undefined,
                isForfeited ? styles.trackProgressForfeited : undefined,
                { width: lineProgressPercent },
              ]}
            />
            <View
              style={[
                styles.trackDot,
                row.isCurrentUser ? styles.trackDotCurrent : undefined,
                isForfeited ? styles.trackDotForfeited : undefined,
                { left: dotProgressPercent },
              ]}
            >
              {isForfeited ? <Text style={styles.trackDotForfeitedText}>기권</Text> : null}
            </View>
          </View>
          <Text style={[styles.distanceText, distanceOffsetStyle, { left: dotProgressPercent }]}>
            {row.distanceKm.toFixed(2)}km
          </Text>
        </View>
      </View>
      <View style={styles.metaColumn}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.82}
          style={[styles.metaRemaining, isForfeited ? styles.metaRemainingForfeited : undefined]}
        >
          {isForfeited ? '기권' : `${row.remainingKm.toFixed(2)}km 남음`}
        </Text>
      </View>
    </View>
  );
});

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

const styles = StyleSheet.create({
  card: {
    gap: 18,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: '#1F2A44',
    backgroundColor: '#0F172A',
    paddingHorizontal: 16,
    paddingVertical: 22,
  },
  eyebrow: {
    color: '#C7D2FE',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 3,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 29,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: '#E5E7EB',
    fontSize: 17,
    lineHeight: 27,
  },
  rowsScroller: {
    maxHeight: 420,
  },
  rows: {
    gap: 14,
    paddingBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 104,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(15,23,42,0.82)',
    paddingHorizontal: 12,
    paddingVertical: 18,
  },
  rowCurrent: {
    borderColor: 'rgba(129,140,248,0.82)',
    backgroundColor: 'rgba(79,70,229,0.22)',
  },
  rowForfeited: {
    borderColor: 'rgba(248,113,113,0.5)',
    backgroundColor: 'rgba(127,29,29,0.22)',
  },
  nameColumn: {
    width: 64,
    gap: 4,
  },
  rankText: {
    color: '#A5B4FC',
    fontSize: 16,
    fontWeight: '800',
  },
  rankTextForfeited: {
    color: '#FCA5A5',
  },
  nameText: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '800',
    lineHeight: 23,
  },
  nameTextCurrent: {
    color: '#E0E7FF',
  },
  nameTextForfeited: {
    color: '#FECACA',
  },
  trackColumn: {
    flex: 1,
    minWidth: 106,
  },
  trackStack: {
    position: 'relative',
    height: 48,
    justifyContent: 'flex-start',
    paddingTop: 10,
  },
  trackLine: {
    position: 'relative',
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(148,163,184,0.28)',
    overflow: 'visible',
  },
  trackProgress: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    borderRadius: 999,
    backgroundColor: 'rgba(109,94,247,0.46)',
  },
  trackProgressCurrent: {
    backgroundColor: 'rgba(129,140,248,0.58)',
  },
  trackProgressForfeited: {
    backgroundColor: 'rgba(248,113,113,0.42)',
  },
  trackDot: {
    position: 'absolute',
    top: '50%',
    marginTop: -14,
    marginLeft: -14,
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 6,
    borderColor: '#6D5EF7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackDotCurrent: {
    borderColor: '#7C6DFF',
  },
  trackDotForfeited: {
    width: 38,
    height: 38,
    marginTop: -19,
    marginLeft: -19,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: '#FECACA',
  },
  trackDotForfeitedText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  distanceText: {
    position: 'absolute',
    top: 28,
    color: '#E0E7FF',
    fontSize: 18,
    fontWeight: '800',
  },
  distanceTextCentered: {
    transform: [{ translateX: -34 }],
  },
  distanceTextNearStart: {
    transform: [{ translateX: -10 }],
  },
  distanceTextNearFinish: {
    transform: [{ translateX: -64 }],
  },
  metaColumn: {
    width: 92,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  metaRemaining: {
    color: '#CBD5E1',
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'right',
  },
  metaRemainingForfeited: {
    color: '#FCA5A5',
  },
});
