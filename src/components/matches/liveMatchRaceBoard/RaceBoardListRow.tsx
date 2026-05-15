import { memo, useMemo } from 'react';
import { Text, View } from 'react-native';
import { liveMatchRaceBoardStyles as styles } from '@/components/matches/liveMatchRaceBoard/styles';
import type { LiveMatchRaceBoardRow } from '@/components/matches/liveMatchRaceBoard/types';

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function areRaceBoardRowsEqual(left: LiveMatchRaceBoardRow, right: LiveMatchRaceBoardRow) {
  return left.id === right.id
    && left.rank === right.rank
    && left.name === right.name
    && left.paceLabel === right.paceLabel
    && left.distanceKm === right.distanceKm
    && left.remainingKm === right.remainingKm
    && left.progress === right.progress
    && left.isCurrentUser === right.isCurrentUser
    && left.liveStatus === right.liveStatus;
}

export const RaceBoardListRow = memo(function RaceBoardListRow({ row }: { row: LiveMatchRaceBoardRow }) {
  const isForfeited = row.liveStatus === 'forfeited';
  const rawProgress = clamp(row.progress, 0, 1);
  const lineProgressPercent = `${rawProgress * 100}%` as const;
  const dotProgressPercent = `${clamp(rawProgress, 0.04, 0.96) * 100}%` as const;
  const distanceOffsetStyle = rawProgress < 0.12
    ? styles.distanceTextNearStart
    : rawProgress > 0.88
      ? styles.distanceTextNearFinish
      : styles.distanceTextCentered;
  const rowStyle = useMemo(() => [
    styles.row,
    row.isCurrentUser ? styles.rowCurrent : undefined,
    isForfeited ? styles.rowForfeited : undefined,
  ], [isForfeited, row.isCurrentUser]);
  const rankTextStyle = useMemo(() => [
    styles.rankText,
    isForfeited ? styles.rankTextForfeited : undefined,
  ], [isForfeited]);
  const nameTextStyle = useMemo(() => [
    styles.nameText,
    row.isCurrentUser ? styles.nameTextCurrent : undefined,
    isForfeited ? styles.nameTextForfeited : undefined,
  ], [isForfeited, row.isCurrentUser]);
  const trackProgressStyle = useMemo(() => [
    styles.trackProgress,
    row.isCurrentUser ? styles.trackProgressCurrent : undefined,
    isForfeited ? styles.trackProgressForfeited : undefined,
    { width: lineProgressPercent },
  ], [isForfeited, lineProgressPercent, row.isCurrentUser]);
  const trackDotStyle = useMemo(() => [
    styles.trackDot,
    row.isCurrentUser ? styles.trackDotCurrent : undefined,
    isForfeited ? styles.trackDotForfeited : undefined,
    { left: dotProgressPercent },
  ], [dotProgressPercent, isForfeited, row.isCurrentUser]);
  const distanceTextStyle = useMemo(() => [
    styles.distanceText,
    distanceOffsetStyle,
    { left: dotProgressPercent },
  ], [distanceOffsetStyle, dotProgressPercent]);
  const metaRemainingStyle = useMemo(() => [
    styles.metaRemaining,
    isForfeited ? styles.metaRemainingForfeited : undefined,
  ], [isForfeited]);

  return (
    <View style={rowStyle}>
      <View style={styles.nameColumn}>
        <Text style={rankTextStyle}>{row.rank}위</Text>
        <Text
          numberOfLines={2}
          style={nameTextStyle}
        >
          {row.isCurrentUser ? '나' : row.name}
        </Text>
      </View>
      <View style={styles.trackColumn}>
        <View style={styles.trackStack}>
          <View style={styles.trackLine}>
            <View style={trackProgressStyle} />
            <View style={trackDotStyle}>
              {isForfeited ? <Text style={styles.trackDotForfeitedText}>기권</Text> : null}
            </View>
          </View>
          <Text style={distanceTextStyle}>
            {row.distanceKm.toFixed(2)}km
          </Text>
        </View>
      </View>
      <View style={styles.metaColumn}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.82}
          style={metaRemainingStyle}
        >
          {isForfeited ? '기권' : `${row.remainingKm.toFixed(2)}km 남음`}
        </Text>
      </View>
    </View>
  );
}, (prevProps, nextProps) => areRaceBoardRowsEqual(prevProps.row, nextProps.row));
