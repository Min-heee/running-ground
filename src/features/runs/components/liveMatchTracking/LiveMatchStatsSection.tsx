import { memo } from 'react';
import { RunningMetricGrid } from '@/features/runs/components/RunningMetricGrid';
import type { LiveMatchMetricLabels } from '@/features/runs/components/liveMatchTracking/types';

export const LiveMatchStatsSection = memo(function LiveMatchStatsSection({
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
