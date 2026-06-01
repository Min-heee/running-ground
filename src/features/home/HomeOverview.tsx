import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { MyRunRecord, RankState, WeeklySummary } from '@/domain';
import { HomeActivityStatusCard } from '@/features/home/components/overview/HomeActivityStatusCard';
import { HomePointGaugeCard } from '@/features/home/components/overview/HomePointGaugeCard';
import { HomeRankCard } from '@/features/home/components/overview/HomeRankCard';
import { HomeRegionBattleCard } from '@/features/home/components/overview/HomeRegionBattleCard';
import {
  buildHomeOverviewCalendarRows,
  buildHomeOverviewPointHeaderLabel,
} from '@/features/home/utils/homeOverview';
import { buildWeeklyPointOverview, type WeeklyPointTrackId } from '@/features/points/pointSystem';
import { MatchRecordSummaryCard } from '@/features/profile/components/MatchRecordSummaryCard';
import { buildMatchRecordSummary } from '@/features/runs/utils/matchRecordSummary';
import { spacing } from '@/theme/tokens';

type HomeOverviewProps = {
  summary: WeeklySummary;
  lifetimeDistanceKm?: number;
  rankState?: RankState;
  runs: MyRunRecord[];
};

export function HomeOverview({
  summary,
  lifetimeDistanceKm,
  rankState,
  runs,
}: HomeOverviewProps) {
  const [calendarMonthOffset, setCalendarMonthOffset] = useState(0);
  const [selectedTrackId, setSelectedTrackId] = useState<WeeklyPointTrackId>('distance');

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
  const selectedTrack = useMemo(
    () => pointOverview.tracks.find((track) => track.id === selectedTrackId) ?? pointOverview.tracks[0],
    [pointOverview.tracks, selectedTrackId],
  );
  const calendarRows = useMemo(() => buildHomeOverviewCalendarRows(selectedTrack), [selectedTrack]);
  const pointHeaderLabel = buildHomeOverviewPointHeaderLabel(selectedTrack);
  const matchRecordSummary = useMemo(() => buildMatchRecordSummary(runs), [runs]);

  return (
    <>
      <HomeRegionBattleCard
        districtName={summary.districtBattle.myDistrict}
        districtRank={summary.districtBattle.districtRank}
        totalDistanceKm={summary.districtBattle.totalDistanceKm}
      />
      <View style={styles.rankRow}>
        <View style={styles.rankRowItem}>
          <HomeRankCard rankState={rankState} compact />
        </View>
        <View style={styles.rankRowItem}>
          <MatchRecordSummaryCard
            href="/match-record"
            totalCount={matchRecordSummary.totalCount}
            duelCount={matchRecordSummary.duelCount}
            groupCount={matchRecordSummary.groupCount}
          />
        </View>
      </View>
      <HomeActivityStatusCard runs={runs} />
      <HomePointGaugeCard
        tracks={pointOverview.tracks}
        selectedTrack={selectedTrack}
        calendarMonthOffset={calendarMonthOffset}
        calendarRows={calendarRows}
        headerLabel={pointHeaderLabel}
        onSelectTrack={setSelectedTrackId}
        onPreviousMonth={() => setCalendarMonthOffset((current) => current - 1)}
        onCurrentMonth={() => setCalendarMonthOffset(0)}
        onNextMonth={() => setCalendarMonthOffset((current) => current + 1)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  rankRow: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: spacing.s12,
  },
  rankRowItem: {
    flex: 1,
  },
});
