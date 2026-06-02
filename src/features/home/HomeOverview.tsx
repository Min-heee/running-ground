import { useMemo, useState } from 'react';
import type { MyRunRecord, RankState, WeeklySummary } from '@/domain';
import { HomeActivityStatusCard } from '@/features/home/components/overview/HomeActivityStatusCard';
import { HomePointGaugeCard } from '@/features/home/components/overview/HomePointGaugeCard';
import { HomeRankCard } from '@/features/home/components/overview/HomeRankCard';
import {
  buildHomeOverviewCalendarRows,
  buildHomeOverviewPointHeaderLabel,
} from '@/features/home/utils/homeOverview';
import { buildWeeklyPointOverview, type WeeklyPointTrackId } from '@/features/points/pointSystem';
import { buildMatchRecordSummary } from '@/features/runs/utils/matchRecordSummary';

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
      <HomeRankCard rankState={rankState} matchRecord={matchRecordSummary} recordHref="/match-record" />
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
