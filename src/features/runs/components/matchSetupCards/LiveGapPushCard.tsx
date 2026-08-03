import { memo, useEffect, useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  buildCustomLiveGapInterval,
  getLiveGapPushConfig,
  LIVE_GAP_CUSTOM_INTERVAL_MAX_MINUTES,
  LIVE_GAP_CUSTOM_INTERVAL_MIN_MINUTES,
  parseCustomIntervalMinutesInput,
  parseCustomLiveGapIntervalMinutes,
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
import { colors, fixedColors, fontSizes, fontWeights, radii, spacing } from '@/theme/tokens';

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
  const customMinutes = parseCustomLiveGapIntervalMinutes(config.interval);
  // 직접 입력 값은 스토어(config.interval)가 단일 진실 — 로컬 입력은 타이핑 중 임시 상태.
  const [customInput, setCustomInput] = useState(customMinutes !== null ? String(customMinutes) : '');

  useEffect(() => {
    // 칩으로 프리셋을 고르면 직접 입력칸을 비운다 (두 값이 동시에 선택된 것처럼 보이지 않게).
    if (customMinutes === null) {
      setCustomInput('');
    }
  }, [customMinutes]);

  const handleCustomInputChange = (raw: string) => {
    // 숫자만 남긴다 — 소수점('.')은 입력 자체가 안 되게 (오너 2026-07-31: 소수점 불가).
    const digitsOnly = raw.replace(/[^0-9]/g, '').slice(0, 3);
    setCustomInput(digitsOnly);

    const minutes = parseCustomIntervalMinutesInput(digitsOnly);
    const nextInterval = minutes === null ? null : buildCustomLiveGapInterval(minutes);

    if (nextInterval) {
      setLiveGapInterval(nextInterval);
    }
  };

  const customInputInvalid = customInput.length > 0 && parseCustomIntervalMinutesInput(customInput) === null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>대결 중간 알림</Text>
      <Text style={styles.subtitle}>시간</Text>
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
      <View style={styles.customRow}>
        <Text style={styles.customLabel}>직접 입력</Text>
        <TextInput
          value={customInput}
          onChangeText={handleCustomInputChange}
          placeholder="예: 7"
          placeholderTextColor={colors.textTertiary}
          keyboardType="number-pad"
          maxLength={3}
          style={[
            styles.customInput,
            customMinutes !== null ? styles.customInputActive : null,
            customInputInvalid ? styles.customInputInvalid : null,
          ]}
        />
        <Text style={styles.customUnit}>분</Text>
      </View>
      <Text style={customInputInvalid ? styles.customHintInvalid : styles.hint}>
        {customInputInvalid
          ? `${LIVE_GAP_CUSTOM_INTERVAL_MIN_MINUTES}분 이상 ${LIVE_GAP_CUSTOM_INTERVAL_MAX_MINUTES}분 이하의 정수로 입력해주세요.`
          : '1분 이상 정수로만 입력할 수 있어요 (소수점 불가).'}
      </Text>
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
    borderColor: colors.cardEdge,
    backgroundColor: colors.surface,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.extraBold,
  },
  subtitle: {
    color: colors.textSecondary,
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
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.xxl,
  },
  chipSelected: {
    borderColor: fixedColors.brand,
    backgroundColor: fixedColors.brand,
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  chipTextSelected: {
    color: fixedColors.white,
  },
  section: {
    gap: spacing.xxs,
    marginTop: spacing.xxs,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxl,
    marginTop: spacing.lg,
  },
  customLabel: {
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  customInput: {
    minWidth: 72,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    color: colors.textPrimary,
    fontWeight: fontWeights.extraBold,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.xxl,
    textAlign: 'center',
  },
  customInputActive: {
    borderColor: fixedColors.brand,
    backgroundColor: colors.surface,
  },
  customInputInvalid: {
    borderColor: colors.dangerAccent,
  },
  customUnit: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  customHintInvalid: {
    color: colors.dangerAccent,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    marginTop: spacing.xxs,
  },
  sectionLabel: {
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  hint: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    marginTop: spacing.xxs,
  },
  rememberSection: {
    gap: spacing.xxs,
    marginTop: spacing.lg,
    paddingTop: spacing.s12,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
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
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    borderColor: fixedColors.brand,
    backgroundColor: fixedColors.brand,
  },
  checkboxMark: {
    color: fixedColors.white,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  checkboxLabel: {
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
});
