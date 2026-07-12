import { useMemo, useState } from 'react';
import type { MyRunRecord, RankState } from '@/domain';
import { HomeActivityStatusCard } from '@/features/home/components/overview/HomeActivityStatusCard';
import { HomePointGaugeCard } from '@/features/home/components/overview/HomePointGaugeCard';
import { HomeRankCard } from '@/features/home/components/overview/HomeRankCard';
import {
  buildHomeOverviewCalendarRows,
  buildHomeOverviewPointHeaderLabel,
} from '@/features/home/utils/homeOverview';
import { buildWeeklyPointOverview, type WeeklyPointTrackId } from '@/features/points/pointSystem';
import { buildCompetitivePointBasis } from '@/features/runs/utils/competitiveRuns';
import { buildMatchRecordSummary } from '@/features/runs/utils/matchRecordSummary';

type HomeOverviewProps = {
  rankState?: RankState;
  runs: MyRunRecord[];
};

export function HomeOverview({
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
  // The point gauge promises "+NP" rewards, and the server mints points for
  // COMPETITIVE runs only (app-tracked / match) — so the gauge computes from
  // the competitive-filtered basis, NOT the all-runs summary/lifetime props
  // (those still feed the personal activity card above, imports included).
  const competitivePointBasis = useMemo(() => buildCompetitivePointBasis(runs), [runs]);
  const pointOverview = useMemo(
    () => buildWeeklyPointOverview(competitivePointBasis.weeklySummary, {
      lifetimeDistanceKm: competitivePointBasis.lifetimeDistanceKm,
      runs: competitivePointBasis.competitiveRuns,
      currentDate: calendarReferenceDate,
    }),
    [calendarReferenceDate, competitivePointBasis],
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
