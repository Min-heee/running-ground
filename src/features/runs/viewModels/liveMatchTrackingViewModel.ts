import type {
  LiveMatchMetricLabels,
  LiveMatchTrackingPageProps,
} from '@/features/runs/components/LiveMatchTrackingPage';
import { formatDuration } from '@/features/runs/tracking';
import {
  formatCadence,
  formatElevation,
  formatMetricDistance,
} from '@/features/runs/tracking/trackingSession';

export type LiveMatchTrackingInputProps = Omit<LiveMatchTrackingPageProps, 'includeMatchCards' | 'metricLabels'>;
export type LiveMatchTrackingViewProps = Omit<LiveMatchTrackingPageProps, 'includeMatchCards'>;

export function buildLiveMatchMetricLabels({
  elapsedSeconds,
  distanceKm,
  averagePace,
  currentPace,
  cadenceSpm,
  elevationGainM,
}: Pick<
  LiveMatchTrackingInputProps,
  | 'elapsedSeconds'
  | 'distanceKm'
  | 'averagePace'
  | 'currentPace'
  | 'cadenceSpm'
  | 'elevationGainM'
>): LiveMatchMetricLabels {
  return {
    elapsedLabel: formatDuration(elapsedSeconds),
    distanceLabel: formatMetricDistance(distanceKm),
    averagePaceLabel: averagePace,
    currentPaceLabel: currentPace,
    cadenceLabel: formatCadence(cadenceSpm),
    elevationLabel: formatElevation(elevationGainM),
  };
}

export function buildLiveMatchTrackingViewProps({
  metricLabels,
  input,
}: {
  metricLabels: LiveMatchMetricLabels;
  input: LiveMatchTrackingInputProps;
}): LiveMatchTrackingViewProps {
  return {
    matchMode: input.matchMode,
    goalKmOverride: input.goalKmOverride,
    liveMatchTitle: input.liveMatchTitle,
    liveMatchText: input.liveMatchText,
    effectiveDuelOpponent: input.effectiveDuelOpponent,
    duelDistanceKm: input.duelDistanceKm,
    duelLiveTitle: input.duelLiveTitle,
    duelLiveSummary: input.duelLiveSummary,
    duelStatusAlert: input.duelStatusAlert,
    distanceKm: input.distanceKm,
    isLeavingDuelMatch: input.isLeavingDuelMatch,
    effectiveGroupParticipantCount: input.effectiveGroupParticipantCount,
    currentGroupStanding: input.currentGroupStanding,
    groupAheadParticipant: input.groupAheadParticipant,
    groupBehindParticipant: input.groupBehindParticipant,
    groupStatusAlert: input.groupStatusAlert,
    isLeavingGroupMatch: input.isLeavingGroupMatch,
    groupLiveStandings: input.groupLiveStandings,
    currentGroupLeader: input.currentGroupLeader,
    elapsedSeconds: input.elapsedSeconds,
    averagePace: input.averagePace,
    currentPace: input.currentPace,
    cadenceSpm: input.cadenceSpm,
    elevationGainM: input.elevationGainM,
    metricLabels,
    useLiveTrackingMetrics: input.useLiveTrackingMetrics,
    onContinueSoloFromMatch: input.onContinueSoloFromMatch,
  };
}
