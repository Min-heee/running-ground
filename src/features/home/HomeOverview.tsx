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
  // 포인트 정책 (오너 2026-07-30 개정): 거리 레벨 사다리는 임포트 러닝 거리도 포함해
  // 오른다 (서버 points.mjs 개정 사다리와 동일 기준). 스트릭/성장 트랙은 여전히 경쟁
  // 러닝(앱 측정/매치) 기반 — 손으로 입력 가능한 헬스 임포트로 파밍하는 건 계속 차단.
  const competitivePointBasis = useMemo(() => buildCompetitivePointBasis(runs), [runs]);
  const allRunsLifetimeDistanceKm = useMemo(
    () => runs.reduce((total, run) => total + run.distanceKm, 0),
    [runs],
  );
  const pointOverview = useMemo(
    () => buildWeeklyPointOverview(competitivePointBasis.weeklySummary, {
      lifetimeDistanceKm: competitivePointBasis.lifetimeDistanceKm,
      ladderLifetimeDistanceKm: allRunsLifetimeDistanceKm,
      runs: competitivePointBasis.competitiveRuns,
      currentDate: calendarReferenceDate,
    }),
    [allRunsLifetimeDistanceKm, calendarReferenceDate, competitivePointBasis],
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
