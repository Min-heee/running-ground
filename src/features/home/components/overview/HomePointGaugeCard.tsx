import { memo, useCallback, useMemo } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import type { DimensionValue, StyleProp, ViewStyle } from 'react-native';
import { Card } from '@/components/Card';
import { HomePointCalendar } from '@/features/home/components/overview/HomePointCalendar';
import type { StreakCalendarCell, WeeklyPointTrack, WeeklyPointTrackId } from '@/features/points/pointSystem';

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
    color: '#667085',
    fontSize: 12,
    fontWeight: '700',
  },
  pointCard: {
    gap: 12,
  },
  pointHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  pointTarget: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '700',
  },
  pointTabRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pointTab: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 999,
    paddingVertical: 9,
    alignItems: 'center',
  },
  pointTabActive: {
    backgroundColor: '#111827',
  },
  pointTabText: {
    color: '#475467',
    fontSize: 12,
    fontWeight: '800',
    includeFontPadding: false,
  },
  pointTabTextActive: {
    color: '#FFFFFF',
  },
  pointValueRow: {
    gap: 6,
  },
  pointValue: {
    color: '#111827',
    fontSize: 28,
    fontWeight: '800',
  },
  pointUnit: {
    color: '#667085',
    fontSize: 15,
    fontWeight: '700',
  },
  pointSub: {
    color: '#667085',
    fontSize: 13,
    fontWeight: '700',
  },
  pointBadge: {
    alignSelf: 'flex-start',
    color: '#111827',
    backgroundColor: '#F3F4F6',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '800',
    includeFontPadding: false,
  },
  pointTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  pointFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#111827',
  },
  pointHelper: {
    color: '#667085',
    lineHeight: 20,
  },
});
