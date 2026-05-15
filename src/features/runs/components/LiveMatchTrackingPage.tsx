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
      <LiveMatchStatsSection metricLabels={metricLabels} />
    </>
  );
});
