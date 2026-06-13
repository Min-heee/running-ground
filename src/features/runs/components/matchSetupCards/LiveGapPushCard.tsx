import { memo, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  getLiveGapPushConfig,
  LIVE_GAP_GROUP_TARGET_OPTIONS,
  LIVE_GAP_INTERVAL_OPTIONS,
  setLiveGapInterval,
  subscribeLiveGapPushConfig,
  toggleLiveGapGroupTarget,
  type LiveGapGroupTarget,
  type LiveGapInterval,
} from '@/features/runs/liveGap/liveGapPushConfig';
import { colors, fontSizes, fontWeights, radii, spacing } from '@/theme/tokens';

type LiveGapPushCardProps = {
  mode: 'duel' | 'group';
};

const Chip = memo(function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.chip, selected ? styles.chipSelected : undefined]} onPress={onPress}>
      <Text style={[styles.chipText, selected ? styles.chipTextSelected : undefined]}>{label}</Text>
    </Pressable>
  );
});

export function LiveGapPushCard({ mode }: LiveGapPushCardProps) {
  const config = useSyncExternalStore(
    subscribeLiveGapPushConfig,
    getLiveGapPushConfig,
    getLiveGapPushConfig,
  );
  const intervalEnabled = config.interval !== 'off';

  return (
    <View style={styles.card}>
      <Text style={styles.title}>대결 중간 알림</Text>
      <Text style={styles.subtitle}>
        {mode === 'duel'
          ? '정한 시간마다 상대와의 거리·페이스 차이를 푸시로 알려줘요.'
          : '정한 시간마다 고른 상대들과의 거리·페이스 차이를 푸시로 알려줘요.'}
      </Text>
      <View style={styles.chipRow}>
        {LIVE_GAP_INTERVAL_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            selected={config.interval === option.value}
            onPress={() => setLiveGapInterval(option.value as LiveGapInterval)}
          />
        ))}
      </View>
      {mode === 'group' && intervalEnabled ? (
        <View style={styles.targetSection}>
          <Text style={styles.targetLabel}>누구와 비교할까요?</Text>
          <View style={styles.chipRow}>
            {LIVE_GAP_GROUP_TARGET_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={config.groupTargets.includes(option.value)}
                onPress={() => toggleLiveGapGroupTarget(option.value as LiveGapGroupTarget)}
              />
            ))}
          </View>
          {config.groupTargets.length === 0 ? (
            <Text style={styles.targetHint}>최소 한 명은 골라야 알림이 가요.</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.xs,
    padding: spacing.s12,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.darkSoft,
    backgroundColor: colors.darkInk,
  },
  title: {
    color: colors.white,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.extraBold,
  },
  subtitle: {
    color: colors.borderNeutral,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xxl,
    marginTop: spacing.xxs,
  },
  chip: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.darkSoft,
    backgroundColor: colors.darkMuted,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.xxl,
  },
  chipSelected: {
    borderColor: colors.brandLight,
    backgroundColor: colors.indigoDeep,
  },
  chipText: {
    color: colors.borderNeutral,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  chipTextSelected: {
    color: colors.white,
  },
  targetSection: {
    gap: spacing.xxs,
    marginTop: spacing.xxs,
  },
  targetLabel: {
    color: colors.white,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  targetHint: {
    color: colors.brandLight,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    marginTop: spacing.xxs,
  },
});
