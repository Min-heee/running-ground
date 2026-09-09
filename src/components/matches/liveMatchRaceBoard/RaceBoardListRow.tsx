import { memo, useMemo } from 'react';
import { Text, View } from 'react-native';
import { liveMatchRaceBoardStyles as styles } from '@/components/matches/liveMatchRaceBoard/styles';
import type { LiveMatchRaceBoardRow } from '@/components/matches/liveMatchRaceBoard/types';
import { resolveForfeitStatusLabel } from '@/features/runs/viewModels/matchForfeitLabels';

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
    && left.isProgressivePlaceholder === right.isProgressivePlaceholder
    && left.liveStatus === right.liveStatus
    && left.disqualified === right.disqualified
    && left.resultLabel === right.resultLabel;
}

export const RaceBoardListRow = memo(function RaceBoardListRow({ row }: { row: LiveMatchRaceBoardRow }) {
  const isForfeited = row.liveStatus === 'forfeited';
  const forfeitLabel = resolveForfeitStatusLabel(row.disqualified);
  const isFinished = row.liveStatus === 'finished';
  const isProgressivePlaceholder = Boolean(row.isProgressivePlaceholder);
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
    isProgressivePlaceholder ? styles.rowProgressivePlaceholder : undefined,
  ], [isForfeited, isProgressivePlaceholder, row.isCurrentUser]);
  const rankTextStyle = useMemo(() => [
    styles.rankText,
    isForfeited ? styles.rankTextForfeited : undefined,
    isProgressivePlaceholder ? styles.rankTextProgressivePlaceholder : undefined,
  ], [isForfeited, isProgressivePlaceholder]);
  const nameTextStyle = useMemo(() => [
    styles.nameText,
    row.isCurrentUser ? styles.nameTextCurrent : undefined,
    isForfeited ? styles.nameTextForfeited : undefined,
    isProgressivePlaceholder ? styles.nameTextProgressivePlaceholder : undefined,
  ], [isForfeited, isProgressivePlaceholder, row.isCurrentUser]);
  const trackProgressStyle = useMemo(() => [
    styles.trackProgress,
    row.isCurrentUser ? styles.trackProgressCurrent : undefined,
    isForfeited ? styles.trackProgressForfeited : undefined,
    isProgressivePlaceholder ? styles.trackProgressProgressivePlaceholder : undefined,
    { width: lineProgressPercent },
  ], [isForfeited, isProgressivePlaceholder, lineProgressPercent, row.isCurrentUser]);
  const trackDotStyle = useMemo(() => [
    styles.trackDot,
    row.isCurrentUser ? styles.trackDotCurrent : undefined,
    isForfeited ? styles.trackDotForfeited : undefined,
    isProgressivePlaceholder ? styles.trackDotProgressivePlaceholder : undefined,
    { left: dotProgressPercent },
  ], [dotProgressPercent, isForfeited, isProgressivePlaceholder, row.isCurrentUser]);
  const distanceTextStyle = useMemo(() => [
    styles.distanceText,
    distanceOffsetStyle,
    { left: dotProgressPercent },
  ], [distanceOffsetStyle, dotProgressPercent]);
  const metaRemainingStyle = useMemo(() => [
    styles.metaRemaining,
    isForfeited ? styles.metaRemainingForfeited : undefined,
    isFinished ? styles.metaRemainingFinished : undefined,
    isProgressivePlaceholder ? styles.metaRemainingProgressivePlaceholder : undefined,
  ], [isFinished, isForfeited, isProgressivePlaceholder]);
  const resultBadgeStyle = useMemo(() => [
    styles.resultBadge,
    row.resultLabel === 'WIN'
      ? styles.resultBadgeWin
      : row.resultLabel === 'LOSE'
        ? styles.resultBadgeLose
        : row.resultLabel === 'DRAW'
          ? styles.resultBadgeDraw
          : undefined,
  ], [row.resultLabel]);
  const remainingLabel = isForfeited
    ? forfeitLabel
    : isFinished
      ? '완주'
      : isProgressivePlaceholder
        ? '진행 중'
        : `${row.remainingKm.toFixed(2)}km 남음`;

  return (
    <View style={rowStyle}>
      <View style={styles.nameColumn}>
        <Text style={rankTextStyle}>{row.rank}위</Text>
        <Text
          numberOfLines={2}
          style={nameTextStyle}
        >
          {/* 내 행도 무조건 닉네임 (오너 2026-08-28) — 행 이름은 VM이 폴백까지 책임진다. */}
          {row.name}
        </Text>
        {row.resultLabel ? (
          <View style={resultBadgeStyle}>
            <Text style={styles.resultBadgeText}>{row.resultLabel}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.trackColumn}>
        <View style={styles.trackStack}>
          <View style={styles.trackLine}>
            <View style={trackProgressStyle} />
            <View style={trackDotStyle}>
              {isForfeited ? <Text style={styles.trackDotForfeitedText}>{forfeitLabel}</Text> : null}
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
          {remainingLabel}
        </Text>
      </View>
    </View>
  );
}, (prevProps, nextProps) => areRaceBoardRowsEqual(prevProps.row, nextProps.row));
