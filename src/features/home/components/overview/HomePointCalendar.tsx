import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StreakCalendarCell, WeeklyPointTrack } from '@/features/points/pointSystem';
import { colors } from '@/theme/tokens';

type HomePointCalendarProps = {
  calendar: NonNullable<WeeklyPointTrack['calendar']>;
  calendarMonthOffset: number;
  calendarRows: StreakCalendarCell[][];
  onPreviousMonth: () => void;
  onCurrentMonth: () => void;
  onNextMonth: () => void;
};

export function HomePointCalendar({
  calendar,
  calendarMonthOffset,
  calendarRows,
  onPreviousMonth,
  onCurrentMonth,
  onNextMonth,
}: HomePointCalendarProps) {
  const weekdayLabels = useMemo(() => calendar.weekdayLabels.map((label) => (
    <Text key={label} style={styles.calendarWeekday}>{label}</Text>
  )), [calendar.weekdayLabels]);
  const calendarRowNodes = useMemo(() => calendarRows.map((row, rowIndex) => (
    <CalendarWeekRow
      key={`calendar-row-${rowIndex}`}
      row={row}
      rowIndex={rowIndex}
    />
  )), [calendarRows]);

  return (
    <View style={styles.calendarWrap}>
      <View style={styles.calendarHeader}>
        <View style={styles.calendarNav}>
          <Pressable style={styles.calendarNavButton} onPress={onPreviousMonth}>
            <Text style={styles.calendarNavButtonText}>이전 달</Text>
          </Pressable>
          <Pressable
            style={[styles.calendarNavButton, calendarMonthOffset === 0 && styles.calendarNavButtonCurrent]}
            onPress={onCurrentMonth}
          >
            <Text
              style={[
                styles.calendarNavButtonText,
                calendarMonthOffset === 0 && styles.calendarNavButtonCurrentText,
              ]}
            >
              이번 달
            </Text>
          </Pressable>
          <Text style={styles.calendarMonth}>{calendar.monthLabel}</Text>
          <Pressable style={styles.calendarNavButton} onPress={onNextMonth}>
            <Text style={styles.calendarNavButtonText}>다음 달</Text>
          </Pressable>
        </View>
        <Text style={styles.calendarMeta}>이번 달 +{calendar.monthlyEarnedPoints}P</Text>
      </View>

      <View style={styles.calendarWeekHeader}>
        {weekdayLabels}
      </View>

      <View style={styles.calendarGrid}>
        {calendarRowNodes}
      </View>
    </View>
  );
}

const CalendarWeekRow = memo(function CalendarWeekRow({
  row,
}: {
  row: StreakCalendarCell[];
  rowIndex: number;
}) {
  const cellNodes = useMemo(() => row.map((cell) => (
    <CalendarDayCell key={cell.key} cell={cell} />
  )), [row]);

  return (
    <View style={styles.calendarRow}>
      {cellNodes}
    </View>
  );
});

const CalendarDayCell = memo(function CalendarDayCell({
  cell,
}: {
  cell: StreakCalendarCell;
}) {
  return (
    <View
      style={[
        styles.calendarCell,
        cell.isPlaceholder && styles.calendarCellPlaceholder,
        cell.didRun && styles.calendarCellActive,
      ]}
    >
      {!cell.isPlaceholder ? (
        <>
          <Text
            style={[
              styles.calendarDay,
              cell.didRun && styles.calendarDayActive,
            ]}
          >
            {cell.dayNumber}
          </Text>
          {cell.earnedPoints > 0 ? (
            <Text style={styles.calendarReward}>+{cell.earnedPoints}</Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  calendarWrap: {
    gap: 10,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  calendarNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  calendarNavButton: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  calendarNavButtonText: {
    color: colors.textStrongMuted,
    fontSize: 11,
    fontWeight: '800',
    includeFontPadding: false,
  },
  calendarNavButtonCurrent: {
    backgroundColor: colors.textPrimary,
  },
  calendarNavButtonCurrentText: {
    color: colors.white,
  },
  calendarMonth: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  calendarMeta: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  calendarWeekHeader: {
    flexDirection: 'row',
  },
  calendarWeekday: {
    flex: 1,
    textAlign: 'center',
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: '700',
  },
  calendarGrid: {
    gap: 6,
  },
  calendarRow: {
    flexDirection: 'row',
    gap: 6,
  },
  calendarCell: {
    flex: 1,
    aspectRatio: 1.12,
    borderRadius: 10,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    padding: 4,
    position: 'relative',
  },
  calendarCellPlaceholder: {
    backgroundColor: 'transparent',
  },
  calendarCellActive: {
    backgroundColor: colors.bluePale,
  },
  calendarDay: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  calendarDayActive: {
    color: colors.blueStrong,
  },
  calendarReward: {
    color: colors.blueStrong,
    fontSize: 9,
    fontWeight: '800',
    includeFontPadding: false,
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    marginTop: -1,
    textAlign: 'center',
  },
});
