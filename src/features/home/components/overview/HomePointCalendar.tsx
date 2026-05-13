import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StreakCalendarCell, WeeklyPointTrack } from '@/features/points/pointSystem';

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
        {calendar.weekdayLabels.map((label) => (
          <Text key={label} style={styles.calendarWeekday}>{label}</Text>
        ))}
      </View>

      <View style={styles.calendarGrid}>
        {calendarRows.map((row, rowIndex) => (
          <View key={`calendar-row-${rowIndex}`} style={styles.calendarRow}>
            {row.map((cell) => (
              <View
                key={cell.key}
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
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

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
    backgroundColor: '#F3F4F6',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  calendarNavButtonText: {
    color: '#344054',
    fontSize: 11,
    fontWeight: '800',
    includeFontPadding: false,
  },
  calendarNavButtonCurrent: {
    backgroundColor: '#111827',
  },
  calendarNavButtonCurrentText: {
    color: '#FFFFFF',
  },
  calendarMonth: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
  },
  calendarMeta: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '700',
  },
  calendarWeekHeader: {
    flexDirection: 'row',
  },
  calendarWeekday: {
    flex: 1,
    textAlign: 'center',
    color: '#98A2B3',
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
    backgroundColor: '#F3F4F6',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    padding: 4,
    position: 'relative',
  },
  calendarCellPlaceholder: {
    backgroundColor: 'transparent',
  },
  calendarCellActive: {
    backgroundColor: '#E8F0FF',
  },
  calendarDay: {
    color: '#667085',
    fontSize: 11,
    fontWeight: '700',
  },
  calendarDayActive: {
    color: '#1D4ED8',
  },
  calendarReward: {
    color: '#1D4ED8',
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
