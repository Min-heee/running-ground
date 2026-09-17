import { memo, useCallback, useMemo } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import type { DimensionValue, StyleProp, ViewStyle } from 'react-native';
import { Card } from '@/components/Card';
import { HomePointCalendar } from '@/features/home/components/overview/HomePointCalendar';
import type { StreakCalendarCell, WeeklyPointTrack, WeeklyPointTrackId } from '@/features/points/pointSystem';
import { colors, fixedColors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type HomePointGaugeCardProps = {
  tracks: WeeklyPointTrack[];
  selectedTrack: WeeklyPointTrack;
  calendarMonthOffset: number;
  calendarRows: StreakCalendarCell[][];
  headerLabel: string;
  onSelectTrack: (trackId: WeeklyPointTrackId) => void;
  onPreviousMonth: () => void;
  onCurrentMonth: () => void;
  onNextMonth: () => void;
};

const PointTrackTab = memo(function PointTrackTab({
  active,
  onSelectTrack,
  track,
}: {
  active: boolean;
  onSelectTrack: (trackId: WeeklyPointTrackId) => void;
  track: WeeklyPointTrack;
}) {
  const tabStyle = useMemo(() => [
    styles.pointTab,
    active && styles.pointTabActive,
  ], [active]);
  const textStyle = useMemo(() => [
    styles.pointTabText,
    active && styles.pointTabTextActive,
  ], [active]);
  const handlePress = useCallback(() => onSelectTrack(track.id), [onSelectTrack, track.id]);

  return (
    <Pressable
      style={tabStyle}
      onPress={handlePress}
    >
      <Text style={textStyle}>{track.label}</Text>
    </Pressable>
  );
});

export function HomePointGaugeCard({
  tracks,
  selectedTrack,
  calendarMonthOffset,
  calendarRows,
  headerLabel,
  onSelectTrack,
  onPreviousMonth,
  onCurrentMonth,
  onNextMonth,
}: HomePointGaugeCardProps) {
  const pointTrackTabs = useMemo(() => tracks.map((track) => (
    <PointTrackTab
      key={track.id}
      active={track.id === selectedTrack.id}
      onSelectTrack={onSelectTrack}
      track={track}
    />
  )), [onSelectTrack, selectedTrack.id, tracks]);
  const pointFillStyle = useMemo<StyleProp<ViewStyle>>(() => [
    styles.pointFill,
    { width: `${selectedTrack.progressPercent}%` as DimensionValue },
  ], [selectedTrack.progressPercent]);

  return (
    <Card style={styles.pointCard}>
      <View style={styles.pointHeader}>
        <Text style={styles.sectionEyebrow}>포인트 게이지</Text>
        <Text style={styles.pointTarget}>{headerLabel}</Text>
      </View>

      <View style={styles.pointTabRow}>
        {pointTrackTabs}
      </View>

      <View style={styles.pointValueRow}>
        {selectedTrack.badgeText ? <Text style={styles.pointBadge}>{selectedTrack.badgeText}</Text> : null}
        {selectedTrack.id === 'streak' ? (
          <Text style={styles.pointValue}>
            {selectedTrack.currentValue}
            <Text style={styles.pointUnit}>{selectedTrack.unit} 연속</Text>
          </Text>
        ) : (
          <Text style={styles.pointValue}>
            {selectedTrack.currentValue}
            <Text style={styles.pointUnit}> / {selectedTrack.targetValue}{selectedTrack.unit}</Text>
          </Text>
        )}
        <Text style={styles.pointSub}>{selectedTrack.statusText}</Text>
      </View>

      <View style={styles.pointTrack}>
        <View style={pointFillStyle} />
      </View>

      {selectedTrack.id === 'streak' && selectedTrack.calendar ? (
        <HomePointCalendar
          calendar={selectedTrack.calendar}
          calendarMonthOffset={calendarMonthOffset}
          calendarRows={calendarRows}
          onPreviousMonth={onPreviousMonth}
          onCurrentMonth={onCurrentMonth}
          onNextMonth={onNextMonth}
        />
      ) : null}

      {selectedTrack.helperText ? <Text style={styles.pointHelper}>{selectedTrack.helperText}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  sectionEyebrow: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  pointCard: {
    gap: spacing.s12,
  },
  pointHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.s12,
  },
  pointTarget: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  pointTabRow: {
    flexDirection: 'row',
    gap: spacing.xxl,
  },
  pointTab: {
    flex: 1,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.pill,
    paddingVertical: 9,
    alignItems: 'center',
  },
  pointTabActive: {
    // 선택 = 브랜드 솔리드 + 흰 글씨 고정 짝 (오너 2026-09-18: 검은 알약을 보라로 통일 — SegmentSwitch와 같은 언어).
    backgroundColor: fixedColors.brand,
  },
  pointTabText: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
    includeFontPadding: false,
  },
  pointTabTextActive: {
    color: fixedColors.white,
  },
  pointValueRow: {
    gap: spacing.lg,
  },
  pointValue: {
    color: colors.textPrimary,
    fontSize: fontSizes.pageTitle,
    fontWeight: fontWeights.extraBold,
  },
  pointUnit: {
    color: colors.textSecondary,
    fontSize: fontSizes.rank,
    fontWeight: fontWeights.bold,
  },
  pointSub: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
  },
  pointBadge: {
    alignSelf: 'flex-start',
    color: colors.textPrimary,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.s10,
    paddingVertical: spacing.sm,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.extraBold,
    includeFontPadding: false,
  },
  pointTrack: {
    height: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.borderMuted,
    overflow: 'hidden',
  },
  pointFill: {
    height: '100%',
    borderRadius: radii.pill,
    // 진행 막대도 브랜드 (오너 2026-09-18). 예전 textPrimary는 라이트에선 검정, 다크에선 흰색이라
    // 같은 막대가 테마마다 다른 의미색으로 읽혔다.
    backgroundColor: fixedColors.brand,
  },
  pointHelper: {
    color: colors.textSecondary,
    lineHeight: 20,
  },
});
