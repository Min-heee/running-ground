import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { colors, fontSizes, fontWeights, radii, spacing } from '@/theme/tokens';
import {
  SOLO_COACH_INTERVAL_CHOICES,
  formatPaceSpoken,
  type SoloCoachConfig,
} from './soloCoachModel';
import { armSoloCoach } from './soloCoachStore';

// 페이스메이커 대기방: 목표 페이스/거리/시간과 피드백 주기·항목을 고르고 바로
// 솔로 러닝을 시작한다 (러닝 탭으로 이동 → useSoloCoachAutoStart가 시작을 당김).

const DISTANCE_CHOICES = [1, 3, 5, 10] as const;
const TIME_CHOICES = [15, 30, 45, 60] as const;

export default function SoloCoachSetupScreen() {
  const [paceMinutes, setPaceMinutes] = useState(6);
  const [paceSeconds, setPaceSeconds] = useState(0);
  const [goalDistanceKm, setGoalDistanceKm] = useState<number | null>(3);
  const [goalTimeMinutes, setGoalTimeMinutes] = useState<number | null>(null);
  const [intervalMinutes, setIntervalMinutes] = useState<number>(2);
  const [announcePace, setAnnouncePace] = useState(true);
  const [announceElapsed, setAnnounceElapsed] = useState(true);
  const [announceDistance, setAnnounceDistance] = useState(true);

  const targetPaceSecPerKm = paceMinutes * 60 + paceSeconds;
  const paceLabel = useMemo(
    () => `${paceMinutes}'${String(paceSeconds).padStart(2, '0')}"`,
    [paceMinutes, paceSeconds],
  );

  const handleStart = () => {
    const config: SoloCoachConfig = {
      targetPaceSecPerKm: announcePace ? targetPaceSecPerKm : null,
      goalDistanceKm,
      goalTimeMinutes,
      intervalMinutes,
      announcePace,
      announceElapsed,
      announceDistance,
    };

    armSoloCoach(config);
    router.replace('/(tabs)/running');
  };

  return (
    <Screen>
      <AuthHeader
        title="페이스메이커"
        subtitle="목표를 정하면 달리는 동안 음성으로 페이스를 잡아드려요. 이어폰을 끼면 화면을 꺼도 들려요."
        showBack
        backHref="/(tabs)/running"
      />

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>목표 페이스</Text>
        <View style={styles.paceRow}>
          <Stepper
            label="분"
            value={paceMinutes}
            onDecrease={() => setPaceMinutes((current) => Math.max(3, current - 1))}
            onIncrease={() => setPaceMinutes((current) => Math.min(12, current + 1))}
          />
          <Stepper
            label="초"
            value={paceSeconds}
            onDecrease={() => setPaceSeconds((current) => (current - 15 + 60) % 60)}
            onIncrease={() => setPaceSeconds((current) => (current + 15) % 60)}
          />
          <View style={styles.paceSummary}>
            <Text style={styles.paceSummaryValue}>{paceLabel}</Text>
            <Text style={styles.paceSummaryCaption}>{formatPaceSpoken(targetPaceSecPerKm)} / km</Text>
          </View>
        </View>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>목표 거리</Text>
        <View style={styles.chipRow}>
          {DISTANCE_CHOICES.map((choice) => (
            <ChoiceChip
              key={choice}
              label={`${choice}km`}
              selected={goalDistanceKm === choice}
              onPress={() => setGoalDistanceKm((current) => (current === choice ? null : choice))}
            />
          ))}
        </View>
        <Text style={styles.helperText}>선택하지 않으면 거리 목표 없이 달려요.</Text>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>목표 시간</Text>
        <View style={styles.chipRow}>
          {TIME_CHOICES.map((choice) => (
            <ChoiceChip
              key={choice}
              label={`${choice}분`}
              selected={goalTimeMinutes === choice}
              onPress={() => setGoalTimeMinutes((current) => (current === choice ? null : choice))}
            />
          ))}
        </View>
        <Text style={styles.helperText}>선택하지 않으면 시간 목표 없이 달려요.</Text>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>피드백 주기</Text>
        <View style={styles.chipRow}>
          {SOLO_COACH_INTERVAL_CHOICES.map((choice) => (
            <ChoiceChip
              key={choice}
              label={`${choice}분마다`}
              selected={intervalMinutes === choice}
              onPress={() => setIntervalMinutes(choice)}
            />
          ))}
        </View>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>어떤 걸 알려드릴까요?</Text>
        <ToggleRow
          label="페이스 코칭"
          caption="목표보다 느리거나 빠르면 알려드려요."
          value={announcePace}
          onValueChange={setAnnouncePace}
        />
        <ToggleRow
          label="경과 시간"
          caption="지금까지 달린 시간을 알려드려요."
          value={announceElapsed}
          onValueChange={setAnnounceElapsed}
        />
        <ToggleRow
          label="거리 진행"
          caption="현재 거리와 목표까지 남은 거리를 알려드려요."
          value={announceDistance}
          onValueChange={setAnnounceDistance}
        />
      </Card>

      <PrimaryButton
        label="페이스메이커와 달리기 시작"
        onPress={handleStart}
        disabled={!announcePace && !announceElapsed && !announceDistance}
      />
      {!announcePace && !announceElapsed && !announceDistance ? (
        <Text style={styles.blockedText}>알려드릴 항목을 하나 이상 켜주세요.</Text>
      ) : null}
      <SecondaryButton label="러닝 탭으로 돌아가기" onPress={() => router.replace('/(tabs)/running')} />
    </Screen>
  );
}

function Stepper({
  label,
  value,
  onDecrease,
  onIncrease,
}: {
  label: string;
  value: number;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperControls}>
        <Pressable style={styles.stepperButton} onPress={onDecrease} accessibilityRole="button">
          <Text style={styles.stepperButtonText}>−</Text>
        </Pressable>
        <Text style={styles.stepperValue}>{value}</Text>
        <Pressable style={styles.stepperButton} onPress={onIncrease} accessibilityRole="button">
          <Text style={styles.stepperButtonText}>＋</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ChoiceChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function ToggleRow({
  label,
  caption,
  value,
  onValueChange,
}: {
  label: string;
  caption: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleCopy}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleCaption}>{caption}</Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ true: colors.brand }} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.s12,
  },
  sectionTitle: {
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
    color: colors.textPrimary,
  },
  helperText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 18,
  },
  blockedText: {
    color: colors.danger,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
  },
  paceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s14,
  },
  paceSummary: {
    flex: 1,
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  paceSummaryValue: {
    color: colors.brand,
    fontSize: fontSizes.pageTitle,
    fontWeight: fontWeights.extraBold,
  },
  paceSummaryCaption: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
  },
  stepper: {
    gap: spacing.lg,
  },
  stepperLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s10,
  },
  stepperButton: {
    width: 34,
    height: 34,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceSubtleAlt,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
  },
  stepperValue: {
    color: colors.textPrimary,
    fontSize: fontSizes.summaryValue,
    fontWeight: fontWeights.extraBold,
    minWidth: 30,
    textAlign: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xxl,
  },
  chip: {
    backgroundColor: colors.surfaceSubtleAlt,
    borderColor: colors.borderMuted,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s10,
  },
  chipSelected: {
    backgroundColor: colors.brandWash,
    borderColor: colors.brand,
  },
  chipText: {
    color: colors.textPrimary,
    fontWeight: fontWeights.bold,
    fontSize: fontSizes.sm,
  },
  chipTextSelected: {
    color: colors.brand,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s12,
  },
  toggleCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  toggleLabel: {
    color: colors.textPrimary,
    fontWeight: fontWeights.extraBold,
    fontSize: fontSizes.rank,
  },
  toggleCaption: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 18,
  },
});
