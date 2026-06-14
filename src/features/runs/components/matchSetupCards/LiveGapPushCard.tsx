import { memo, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  getLiveGapPushConfig,
  LIVE_GAP_DELIVERY_MODE_OPTIONS,
  LIVE_GAP_GROUP_TARGET_OPTIONS,
  LIVE_GAP_INTERVAL_OPTIONS,
  LIVE_GAP_METRIC_OPTIONS,
  setLiveGapDeliveryMode,
  setLiveGapInterval,
  setLiveGapRemember,
  subscribeLiveGapPushConfig,
  toggleLiveGapGroupTarget,
  toggleLiveGapMetric,
  type LiveGapDeliveryMode,
  type LiveGapGroupTarget,
  type LiveGapInterval,
  type LiveGapMetric,
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

const CheckboxRow = memo(function CheckboxRow({
  label,
  checked,
  onPress,
}: {
  label: string;
  checked: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={styles.checkboxRow}
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View style={[styles.checkbox, checked ? styles.checkboxChecked : undefined]}>
        {checked ? <Text style={styles.checkboxMark}>✓</Text> : null}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
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
  const voiceOn = config.deliveryMode === 'voice' || config.deliveryMode === 'both';

  return (
    <View style={styles.card}>
      <Text style={styles.title}>대결 중간 알림</Text>
      <Text style={styles.subtitle}>
        {mode === 'duel'
          ? '정한 시간마다 고른 정보를 푸시로 알려줘요.'
          : '정한 시간마다 고른 상대들과의 정보를 푸시로 알려줘요.'}
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
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>누구와 비교할까요?</Text>
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
            <Text style={styles.hint}>최소 한 명은 골라야 알림이 가요.</Text>
          ) : null}
        </View>
      ) : null}
      {intervalEnabled ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>무엇을 알려줄까요?</Text>
          <View style={styles.chipRow}>
            {LIVE_GAP_METRIC_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={config.metrics.includes(option.value)}
                onPress={() => toggleLiveGapMetric(option.value as LiveGapMetric)}
              />
            ))}
          </View>
          {config.metrics.length === 0 ? (
            <Text style={styles.hint}>최소 한 개는 골라야 알림이 가요.</Text>
          ) : null}
        </View>
      ) : null}
      {intervalEnabled ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>알림 방식</Text>
          <View style={styles.chipRow}>
            {LIVE_GAP_DELIVERY_MODE_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={config.deliveryMode === option.value}
                onPress={() => setLiveGapDeliveryMode(option.value as LiveGapDeliveryMode)}
              />
            ))}
          </View>
          <Text style={styles.hint}>
            {voiceOn
              ? '이어폰으로 음성을 읽어줘요 (음악은 잠깐 작아져요).'
              : '화면 알림으로만 보여줘요.'}
          </Text>
        </View>
      ) : null}
      <View style={styles.rememberSection}>
        <CheckboxRow
          label="다음에도 이 설정 기억하기"
          checked={config.remember}
          onPress={() => setLiveGapRemember(!config.remember)}
        />
        <Text style={styles.hint}>
          {config.remember
            ? '앱을 다시 켜도 이 옵션 그대로 유지돼요.'
            : '끄면 이번만 적용되고 다음 실행엔 기본값으로 돌아가요.'}
        </Text>
      </View>
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
  section: {
    gap: spacing.xxs,
    marginTop: spacing.xxs,
  },
  sectionLabel: {
    color: colors.white,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  hint: {
    color: colors.brandLight,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    marginTop: spacing.xxs,
  },
  rememberSection: {
    gap: spacing.xxs,
    marginTop: spacing.lg,
    paddingTop: spacing.s12,
    borderTopWidth: 1,
    borderTopColor: colors.darkSoft,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxl,
  },
  checkbox: {
    width: spacing.s20,
    height: spacing.s20,
    borderRadius: radii.xs,
    borderWidth: 1,
    borderColor: colors.darkSoft,
    backgroundColor: colors.darkMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    borderColor: colors.brandLight,
    backgroundColor: colors.indigoDeep,
  },
  checkboxMark: {
    color: colors.white,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  checkboxLabel: {
    color: colors.white,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
});
