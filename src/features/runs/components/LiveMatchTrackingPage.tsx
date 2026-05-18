import { memo, useEffect, useRef } from 'react';
import { LiveMatchProgressSection } from '@/features/runs/components/liveMatchTracking/LiveMatchProgressSection';
import { LiveMatchStatsSection } from '@/features/runs/components/liveMatchTracking/LiveMatchStatsSection';
import type {
  LiveMatchMetricLabels,
  LiveMatchProgressSectionProps,
  MatchStatusAlert,
} from '@/features/runs/components/liveMatchTracking/types';
import {
  createMatchArenaDiagnosticsThrottle,
  reportComponentMountDiagnostics,
} from '@/utils/matchArenaDiagnostics';
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
  const diagnosticsInstanceIdRef = useRef(`tracking-page-${Math.random().toString(36).slice(2, 8)}`);
  const diagnosticsThrottleRef = useRef(createMatchArenaDiagnosticsThrottle());
  const hasReportedDiagnosticsMountRef = useRef(false);
  const hasEffectiveDuelOpponent = effectiveDuelOpponent !== null;
  const hasDuelStatusAlert = duelStatusAlert !== null;
  const hasCurrentGroupStanding = currentGroupStanding !== null;
  const hasGroupAheadParticipant = groupAheadParticipant !== null;
  const hasGroupBehindParticipant = groupBehindParticipant !== null;
  const hasGroupStatusAlert = groupStatusAlert !== null;
  const hasCurrentGroupLeader = currentGroupLeader !== null;
  const groupLiveStandingsCount = groupLiveStandings.length;

  useEffect(() => {
    const mountPhase = hasReportedDiagnosticsMountRef.current ? 'update' : 'mount';
    hasReportedDiagnosticsMountRef.current = true;
    reportComponentMountDiagnostics({
      componentName: 'LiveMatchTrackingPage',
      instanceId: diagnosticsInstanceIdRef.current,
      mountPhase,
      payload: {
        includeMatchCards,
        matchMode,
        liveMatchTitle,
        liveMatchText,
        hasEffectiveDuelOpponent,
        duelDistanceKm,
        duelLiveTitle,
        duelLiveSummary,
        hasDuelStatusAlert,
        distanceKm,
        isLeavingDuelMatch,
        effectiveGroupParticipantCount,
        hasCurrentGroupStanding,
        hasGroupAheadParticipant,
        hasGroupBehindParticipant,
        hasGroupStatusAlert,
        isLeavingGroupMatch,
        groupLiveStandingsCount,
        hasCurrentGroupLeader,
      },
    }, diagnosticsThrottleRef.current);
  }, [
    distanceKm,
    duelDistanceKm,
    duelLiveSummary,
    duelLiveTitle,
    effectiveGroupParticipantCount,
    groupLiveStandingsCount,
    hasCurrentGroupLeader,
    hasCurrentGroupStanding,
    hasDuelStatusAlert,
    hasEffectiveDuelOpponent,
    hasGroupAheadParticipant,
    hasGroupBehindParticipant,
    hasGroupStatusAlert,
    includeMatchCards,
    isLeavingDuelMatch,
    isLeavingGroupMatch,
    liveMatchText,
    liveMatchTitle,
    matchMode,
  ]);

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
