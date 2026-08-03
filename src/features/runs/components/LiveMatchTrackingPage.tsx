import { memo } from 'react';
import { LiveMatchProgressSection } from '@/features/runs/components/liveMatchTracking/LiveMatchProgressSection';
import { LiveMatchStatsSection } from '@/features/runs/components/liveMatchTracking/LiveMatchStatsSection';
import type {
  LiveMatchMetricLabels,
  LiveMatchProgressSectionProps,
  MatchStatusAlert,
} from '@/features/runs/components/liveMatchTracking/types';
import { useDevRenderCounter } from '@/utils/useDevRenderCounter';

export type {
  LiveMatchMetricLabels,
  MatchStatusAlert,
};

export type LiveMatchTrackingPageProps = LiveMatchProgressSectionProps & {
  elapsedSeconds: number;
  averagePace: string;
  currentPace: string;
  cadenceSpm: number | null;
  elevationGainM: number;
  metricLabels: LiveMatchMetricLabels;
  useLiveTrackingMetrics?: boolean;
  // 목표 링의 목표 거리 — 매치는 매치 목표, 없으면(솔로) 솔로 목표 스토어를 쓴다.
  goalKmOverride?: number;
};

export const LiveMatchTrackingPage = memo(function LiveMatchTrackingPage({
  includeMatchCards,
  matchMode,
  liveMatchTitle,
  liveMatchText,
  effectiveDuelOpponent,
  duelDistanceKm,
  duelLiveTitle,
  duelLiveSummary,
  duelStatusAlert,
  distanceKm,
  isLeavingDuelMatch,
  effectiveGroupParticipantCount,
  currentGroupStanding,
  groupAheadParticipant,
  groupBehindParticipant,
  groupStatusAlert,
  isLeavingGroupMatch,
  groupLiveStandings,
  currentGroupLeader,
  metricLabels,
  useLiveTrackingMetrics,
  goalKmOverride,
  onContinueSoloFromMatch,
}: LiveMatchTrackingPageProps) {
  useDevRenderCounter(`LiveMatchTrackingPage:${matchMode}`);

  return (
    <>
      <LiveMatchProgressSection
        includeMatchCards={includeMatchCards}
        matchMode={matchMode}
        liveMatchTitle={liveMatchTitle}
        liveMatchText={liveMatchText}
        effectiveDuelOpponent={effectiveDuelOpponent}
        duelDistanceKm={duelDistanceKm}
        duelLiveTitle={duelLiveTitle}
        duelLiveSummary={duelLiveSummary}
        duelStatusAlert={duelStatusAlert}
        distanceKm={distanceKm}
        isLeavingDuelMatch={isLeavingDuelMatch}
        effectiveGroupParticipantCount={effectiveGroupParticipantCount}
        currentGroupStanding={currentGroupStanding}
        groupAheadParticipant={groupAheadParticipant}
        groupBehindParticipant={groupBehindParticipant}
        groupStatusAlert={groupStatusAlert}
        isLeavingGroupMatch={isLeavingGroupMatch}
        groupLiveStandings={groupLiveStandings}
        currentGroupLeader={currentGroupLeader}
        onContinueSoloFromMatch={onContinueSoloFromMatch}
      />
      <LiveMatchStatsSection
        metricLabels={metricLabels}
        useLiveTrackingMetrics={useLiveTrackingMetrics}
        goalKmOverride={goalKmOverride}
      />
    </>
  );
});
