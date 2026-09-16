import { useMemo, useState } from 'react';
import type { MyRunRecord, RankState } from '@/domain';
import { HomePointGaugeCard } from '@/features/home/components/overview/HomePointGaugeCard';
import { HomeRankCard } from '@/features/home/components/overview/HomeRankCard';
import { HomeWeeklyStatusCard } from '@/features/home/components/overview/HomeWeeklyStatusCard';
import { HomeWeeklyStreakBadge } from '@/features/home/components/overview/HomeWeeklyStreakBadge';
import {
  buildHomeOverviewCalendarRows,
  buildHomeOverviewPointHeaderLabel,
} from '@/features/home/utils/homeOverview';
import { buildWeeklyPointOverview, type WeeklyPointTrackId } from '@/features/points/pointSystem';
import { buildCompetitivePointBasis } from '@/features/runs/utils/competitiveRuns';
import { buildDuelRecordSummary } from '@/features/runs/utils/duelRecordSummary';

type HomeOverviewProps = {
  rankState?: RankState;
  runs: MyRunRecord[];
  // 주 연속 러닝 뱃지 (오너 2026-09-01) — 서버 파생값(홈 summary). 구백엔드 응답이면 0.
  weeklyStreakWeeks: number;
  weeklyStreakRanThisWeek: boolean;
  weeklyStreakMinWeekDistanceKm: number;
  // '이번 주' 카드 (오너 2026-09-16) — 홈 summary의 이번 주 합계와 목표 달성률.
  weeklyDistanceKm: number;
  weeklyRunCount: number;
  weeklyGoalRate: number;
  weeklyGoalKm?: number;
};

export function HomeOverview({
  rankState,
  runs,
  weeklyStreakWeeks,
  weeklyStreakRanThisWeek,
  weeklyStreakMinWeekDistanceKm,
  weeklyDistanceKm,
  weeklyRunCount,
  weeklyGoalRate,
  weeklyGoalKm,
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
  const duelRecord = useMemo(() => buildDuelRecordSummary(runs), [runs]);

  return (
    <>
      <HomeRankCard rankState={rankState} duelRecord={duelRecord} recordHref="/match-record" />
      <HomeWeeklyStreakBadge
        weeks={weeklyStreakWeeks}
        ranThisWeek={weeklyStreakRanThisWeek}
        minWeekDistanceKm={weeklyStreakMinWeekDistanceKm}
      />
      {/* '내 러닝 기록'(주/월/년 + 그래프)은 기록 탭으로 옮겼고(오너 2026-09-16) 그 자리에
          '이번 주' 숫자 세 칸이 선다 — 그래프는 기록 탭이 맡는다. runs는 포인트·전적 계산에 계속 쓴다. */}
      <HomeWeeklyStatusCard
        totalDistanceKm={weeklyDistanceKm}
        totalRuns={weeklyRunCount}
        goalAchievementRate={weeklyGoalRate}
        weeklyGoalKm={weeklyGoalKm}
      />
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
