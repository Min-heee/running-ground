import { memo, useMemo } from 'react';
import { RunningMetricGrid } from '@/features/runs/components/RunningMetricGrid';
import type { LiveMatchMetricLabels } from '@/features/runs/components/liveMatchTracking/types';
import { formatDuration } from '@/features/runs/tracking';
import { useLiveTrackingMetricFrame } from '@/features/runs/tracking/liveTrackingMetricStore';
import {
  formatCadence,
  formatElevation,
  formatMetricDistance,
} from '@/features/runs/tracking/trackingSession';

export const LiveMatchStatsSection = memo(function LiveMatchStatsSection({
  metricLabels,
  useLiveTrackingMetrics = false,
}: {
  metricLabels: LiveMatchMetricLabels;
  useLiveTrackingMetrics?: boolean;
}) {
  if (useLiveTrackingMetrics) {
    return <LiveMatchStatsSectionFromStore />;
  }

  return <LiveMatchStatsGrid metricLabels={metricLabels} />;
});

const LiveMatchStatsSectionFromStore = memo(function LiveMatchStatsSectionFromStore() {
  const liveMetricFrame = useLiveTrackingMetricFrame();
  const liveMetricLabels = useMemo<LiveMatchMetricLabels>(() => ({
    elapsedLabel: formatDuration(liveMetricFrame.elapsedSeconds),
    distanceLabel: formatMetricDistance(liveMetricFrame.distanceKm),
    averagePaceLabel: liveMetricFrame.averagePace,
    currentPaceLabel: liveMetricFrame.currentPace,
    cadenceLabel: formatCadence(liveMetricFrame.cadenceSpm),
    elevationLabel: formatElevation(liveMetricFrame.elevationGainM),
  }), [liveMetricFrame]);

  return <LiveMatchStatsGrid metricLabels={liveMetricLabels} />;
});

const LiveMatchStatsGrid = memo(function LiveMatchStatsGrid({
  metricLabels,
}: {
  metricLabels: LiveMatchMetricLabels;
}) {
  return (
    <RunningMetricGrid
      elapsedLabel={metricLabels.elapsedLabel}
      distanceLabel={metricLabels.distanceLabel}
      averagePaceLabel={metricLabels.averagePaceLabel}
      currentPaceLabel={metricLabels.currentPaceLabel}
      cadenceLabel={metricLabels.cadenceLabel}
      elevationLabel={metricLabels.elevationLabel}
    />
  );
});
