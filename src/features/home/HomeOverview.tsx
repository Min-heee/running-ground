import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Card } from '@/components/Card';
import { MyRunRecord, WeeklySummary } from '@/domain/types';
import { buildWeeklyPointOverview } from '@/features/points/pointSystem';

export function HomeOverview({
  summary,
  lifetimeDistanceKm,
  runs,
}: {
  summary: WeeklySummary;
  lifetimeDistanceKm?: number;
  runs: MyRunRecord[];
}) {
  const [calendarMonthOffset, setCalendarMonthOffset] = useState(0);
  const calendarReferenceDate = useMemo(() => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() + calendarMonthOffset);
    return date;
  }, [calendarMonthOffset]);
  const pointOverview = useMemo(
    () => buildWeeklyPointOverview(summary, { lifetimeDistanceKm, runs, currentDate: calendarReferenceDate }),
    [calendarReferenceDate, lifetimeDistanceKm, runs, summary],
  );
  const [selectedTrackId, setSelectedTrackId] = useState<'distance' | 'streak' | 'growth'>('distance');
  const selectedTrack = useMemo(
    () => pointOverview.tracks.find((track) => track.id === selectedTrackId) ?? pointOverview.tracks[0],
    [pointOverview.tracks, selectedTrackId],
  );
  const calendarRows = useMemo(() => {
    if (!selectedTrack.calendar) {
      return [];
    }

    return Array.from({ length: Math.ceil(selectedTrack.calendar.cells.length / 7) }, (_, rowIndex) => {
      const row = selectedTrack.calendar?.cells.slice(rowIndex * 7, rowIndex * 7 + 7) ?? [];

      while (row.length < 7) {
        row.push({
          key: `trailing-placeholder-${rowIndex}-${row.length}`,
          didRun: false,
          earnedPoints: 0,
          isToday: false,
          isPlaceholder: true,
        });
      }

      return row;
    });
  }, [selectedTrack.calendar]);
  const streakTrack = pointOverview.tracks.find((track) => track.id === 'streak') ?? pointOverview.tracks[1];
  const pointHeaderLabel = selectedTrack.id === 'streak'
    ? '2일차 +1P · 3일차 +3P · n일차 +(2n-3)P'
    : selectedTrack.scope === 'lifetime'
      ? `레벨업 시 +${selectedTrack.rewardPoints}P`
      : `달성 시 +${selectedTrack.rewardPoints}P`;

  return (
    <>
      <Card style={styles.regionCard}>
        <Text style={styles.darkEyebrow}>우리 지역 배틀</Text>
        <Text style={styles.regionTitle}>{summary.districtBattle.myDistrict}</Text>
        <View style={styles.regionMetricRow}>
          <View style={styles.regionMetricBox}>
            <Text style={styles.regionMetricLabel}>현재 순위</Text>
            <Text style={styles.regionMetricValue}>{summary.districtBattle.districtRank}위</Text>
          </View>
          <View style={styles.regionMetricBox}>
            <Text style={styles.regionMetricLabel}>총거리</Text>
            <Text style={styles.regionMetricValue}>{summary.districtBattle.totalDistanceKm}km</Text>
          </View>
        </View>
      </Card>

      <Card style={styles.statusCard}>
        <View style={styles.statusMetric}>
          <Text style={styles.statusLabel}>이번 주 거리</Text>
          <Text style={styles.statusValue}>{summary.totalDistanceKm}km</Text>
        </View>
        <View style={styles.statusDivider} />
        <View style={styles.statusMetric}>
          <Text style={styles.statusLabel}>러닝</Text>
          <Text style={styles.statusValue}>{summary.totalRuns}회</Text>
        </View>
        <View style={styles.statusDivider} />
        <View style={styles.statusMetric}>
          <Text style={styles.statusLabel}>연속</Text>
          <Text style={styles.statusValue}>{streakTrack.currentValue}일</Text>
        </View>
      </Card>

      <Card style={styles.pointCard}>
        <View style={styles.pointHeader}>
          <Text style={styles.sectionEyebrow}>포인트 게이지</Text>
          <Text style={styles.pointTarget}>{pointHeaderLabel}</Text>
        </View>

        <View style={styles.pointTabRow}>
          {pointOverview.tracks.map((track) => {
            const active = track.id === selectedTrack.id;

            return (
              <Pressable
                key={track.id}
                style={[styles.pointTab, active && styles.pointTabActive]}
                onPress={() => setSelectedTrackId(track.id)}
              >
                <Text style={[styles.pointTabText, active && styles.pointTabTextActive]}>{track.label}</Text>
              </Pressable>
            );
          })}
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
          <View style={[styles.pointFill, { width: `${selectedTrack.progressPercent}%` }]} />
        </View>

        {selectedTrack.id === 'streak' && selectedTrack.calendar ? (
          <View style={styles.calendarWrap}>
            <View style={styles.calendarHeader}>
              <View style={styles.calendarNav}>
                <Pressable
                  style={styles.calendarNavButton}
                  onPress={() => setCalendarMonthOffset((current) => current - 1)}
                >
                  <Text style={styles.calendarNavButtonText}>이전 달</Text>
                </Pressable>
                <Pressable
                  style={[styles.calendarNavButton, calendarMonthOffset === 0 && styles.calendarNavButtonCurrent]}
                  onPress={() => setCalendarMonthOffset(0)}
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
                <Text style={styles.calendarMonth}>{selectedTrack.calendar.monthLabel}</Text>
                <Pressable
                  style={styles.calendarNavButton}
                  onPress={() => setCalendarMonthOffset((current) => current + 1)}
                >
                  <Text style={styles.calendarNavButtonText}>다음 달</Text>
                </Pressable>
              </View>
              <Text style={styles.calendarMeta}>이번 달 +{selectedTrack.calendar.monthlyEarnedPoints}P</Text>
            </View>

            <View style={styles.calendarWeekHeader}>
              {selectedTrack.calendar.weekdayLabels.map((label) => (
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
        ) : null}

        {selectedTrack.helperText ? <Text style={styles.pointHelper}>{selectedTrack.helperText}</Text> : null}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  regionCard: {
    backgroundColor: '#111827',
    gap: 10,
  },
  darkEyebrow: {
    color: '#C7D2FE',
    fontWeight: '700',
    fontSize: 12,
  },
  regionTitle: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
  },
  regionMetricRow: {
    flexDirection: 'row',
    gap: 10,
  },
  regionMetricBox: {
    flex: 1,
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  regionMetricLabel: {
    color: '#D0D5DD',
    fontSize: 12,
  },
  regionMetricValue: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    paddingVertical: 14,
  },
  statusMetric: {
    flex: 1,
    gap: 4,
    alignItems: 'center',
  },
  statusLabel: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '600',
  },
  statusValue: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '800',
  },
  statusDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#E5E7EB',
  },
  twoColumnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  linkCardWrap: {
    flex: 1,
  },
  compactCard: {
    minHeight: 156,
    justifyContent: 'space-between',
  },
  cardEyebrow: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '700',
  },
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
  compactLabel: {
    color: '#101828',
    fontSize: 14,
    fontWeight: '600',
  },
  compactValue: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '800',
  },
  compactValueSmall: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
  },
  muted: { color: '#667085', lineHeight: 20 },
  myRaceCard: {
    gap: 6,
  },
  myRaceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  myRaceBadge: {
    color: '#067647',
    backgroundColor: '#ECFDF3',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 11,
    fontWeight: '800',
    includeFontPadding: false,
  },
  myRaceTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  myRaceTime: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '700',
  },
});
