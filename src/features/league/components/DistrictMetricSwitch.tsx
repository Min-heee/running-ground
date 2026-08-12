import { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { DistrictPersonalMetric } from '@/domain';
import { colors, spacing, fontWeights, radii } from '@/theme/tokens';

type DistrictMetricSwitchProps = {
  metric: DistrictPersonalMetric;
  onChange: (metric: DistrictPersonalMetric) => void;
};

export const DistrictMetricSwitch = memo(function DistrictMetricSwitch({
  metric,
  onChange,
}: DistrictMetricSwitchProps) {
  return (
    <View style={styles.metricSwitch}>
      {/* 오너 확정 2026-08-13: 이번달 거리가 왼쪽, 랭크 점수가 오른쪽. */}
      <MetricButton
        label="이번달 거리"
        metric="monthlyDistance"
        active={metric === 'monthlyDistance'}
        onSelect={onChange}
      />
      <MetricButton
        label="랭크 점수"
        metric="rankScore"
        active={metric === 'rankScore'}
        onSelect={onChange}
      />
    </View>
  );
});

type MetricButtonProps = {
  label: string;
  active: boolean;
  metric: DistrictPersonalMetric;
  onSelect: (metric: DistrictPersonalMetric) => void;
};

const MetricButton = memo(function MetricButton({
  active,
  label,
  metric,
  onSelect,
}: MetricButtonProps) {
  const handlePress = useCallback(() => {
    onSelect(metric);
  }, [metric, onSelect]);
  const metricButtonStyle = useMemo(
    () => [styles.metricButton, active && styles.metricButtonActive],
    [active],
  );
  const metricButtonTextStyle = useMemo(
    () => [styles.metricButtonText, active && styles.metricButtonTextActive],
    [active],
  );

  return (
    <Pressable style={metricButtonStyle} onPress={handlePress}>
      <Text style={metricButtonTextStyle}>{label}</Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  metricSwitch: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.lg,
    padding: spacing.sm,
    gap: spacing.lg,
  },
  metricButton: {
    flex: 1,
    borderRadius: radii.sm,
    paddingVertical: spacing.s10,
    alignItems: 'center',
  },
  metricButtonActive: {
    backgroundColor: colors.surface,
  },
  metricButtonText: {
    color: colors.textSecondary,
    fontWeight: fontWeights.bold,
  },
  metricButtonTextActive: {
    color: colors.textPrimary,
  },
});
