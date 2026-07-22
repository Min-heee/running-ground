import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';

import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { colors, fontSizes, fontWeights, radii, spacing } from '@/theme/tokens';
import {
  SOLO_COACH_INTERVAL_CHOICES,
  applyGoalEdit,
  createDefaultGoalState,
  getDerivedGoalField,
  type GoalField,
  type SoloCoachConfig,
} from './soloCoachModel';
import { clearGhostRace } from '@/features/runs/ghostRun/ghostRaceStore';
import { armSoloCoach } from './soloCoachStore';

// 페이스메이커 대기방. 목표 페이스·거리·시간은 서로 엮여 있어서 (페이스×거리=시간)
// 두 개를 조정하면 나머지 하나는 자동 계산된다 — 마지막에 만진 두 개가 기준.

const CUSTOM_INTERVAL = -1;

function formatTimeLabel(timeSec: number): string {
  const total = Math.round(timeSec);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const minutePart = hours > 0 ? `${hours}시간 ${minutes}분` : `${minutes}분`;
  return seconds > 0 ? `${minutePart} ${seconds}초` : minutePart;
}

export default function SoloCoachSetupScreen() {
  const [goal, setGoal] = useState(createDefaultGoalState);
  const [intervalChoice, setIntervalChoice] = useState<number>(2);
  const [customIntervalText, setCustomIntervalText] = useState('');
  const [announcePace, setAnnouncePace] = useState(true);
  const [announceElapsed, setAnnounceElapsed] = useState(true);
  const [announceDistance, setAnnounceDistance] = useState(true);

  const derivedField = getDerivedGoalField(goal);

  const paceMinutes = Math.floor(Math.round(goal.paceSecPerKm) / 60);
  const paceSeconds = Math.round(goal.paceSecPerKm) % 60;
  const timeMinutesRounded = Math.round(goal.timeSec / 60);

  const editGoal = (field: GoalField, value: number) => {
    setGoal((current) => applyGoalEdit(current, field, value));
  };

  const customIntervalMinutes = useMemo(() => {
    const parsed = Number.parseInt(customIntervalText, 10);
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : null;
  }, [customIntervalText]);

  const effectiveIntervalMinutes = intervalChoice === CUSTOM_INTERVAL
    ? customIntervalMinutes
    : intervalChoice;

  const nothingToAnnounce = !announcePace && !announceElapsed && !announceDistance;
  const startBlockedReason = nothingToAnnounce
    ? '알려드릴 항목을 하나 이상 켜주세요.'
    : effectiveIntervalMinutes === null
      ? '피드백 주기를 1분 이상 숫자로 입력해주세요.'
      : null;

  const handleStart = () => {
    if (startBlockedReason || effectiveIntervalMinutes === null) {
      return;
    }

    const config: SoloCoachConfig = {
      targetPaceSecPerKm: announcePace ? Math.round(goal.paceSecPerKm) : null,
      goalDistanceKm: Math.round(goal.distanceKm * 10) / 10,
      goalTimeMinutes: goal.timeSec / 60,
      intervalMinutes: effectiveIntervalMinutes,
      announcePace,
      announceElapsed,
      announceDistance,
    };

    clearGhostRace();
    armSoloCoach(config);
    router.replace('/(tabs)/running');
  };

  return (
    <Screen>
      <AuthHeader
        title="페이스메이커"
        subtitle=""
        showBack
        backHref="/(tabs)/running"
      />

      <Card style={styles.card}>
        <GoalHeader title="목표 페이스" derived={derivedField === 'pace'} />
        <View style={styles.goalRow}>
          <Stepper
            label="분"
            value={paceMinutes}
            onDecrease={() => editGoal('pace', goal.paceSecPerKm - 60)}
            onIncrease={() => editGoal('pace', goal.paceSecPerKm + 60)}
          />
          <Stepper
            label="초"
            value={paceSeconds}
            onDecrease={() => editGoal('pace', goal.paceSecPerKm - 15)}
            onIncrease={() => editGoal('pace', goal.paceSecPerKm + 15)}
          />
          <View style={styles.goalSummary}>
            <Text style={styles.goalSummaryValue}>
              {paceMinutes}'{String(paceSeconds).padStart(2, '0')}"
            </Text>
            <Text style={styles.goalSummaryCaption}>/ km</Text>
          </View>
        </View>
      </Card>

      <Card style={styles.card}>
        <GoalHeader title="목표 거리" derived={derivedField === 'distance'} />
        <View style={styles.goalRow}>
          <Stepper
            label="km"
            value={Number((Math.round(goal.distanceKm * 10) / 10).toFixed(1))}
            onDecrease={() => editGoal('distance', goal.distanceKm - 0.5)}
            onIncrease={() => editGoal('distance', goal.distanceKm + 0.5)}
          />
          <View style={styles.goalSummary}>
            <Text style={styles.goalSummaryValue}>{(Math.round(goal.distanceKm * 10) / 10).toFixed(1)}km</Text>
          </View>
        </View>
      </Card>

      <Card style={styles.card}>
        <GoalHeader title="목표 시간" derived={derivedField === 'time'} />
        <View style={styles.goalRow}>
          <Stepper
            label="분"
            value={timeMinutesRounded}
            onDecrease={() => editGoal('time', (timeMinutesRounded - 1) * 60)}
            onIncrease={() => editGoal('time', (timeMinutesRounded + 1) * 60)}
          />
          <View style={styles.goalSummary}>
            <Text style={styles.goalSummaryValue}>{formatTimeLabel(goal.timeSec)}</Text>
          </View>
        </View>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>피드백 주기</Text>
        <View style={styles.chipRow}>
          {SOLO_COACH_INTERVAL_CHOICES.map((choice) => (
            <ChoiceChip
              key={choice}
              label={`${choice}분`}
              selected={intervalChoice === choice}
              onPress={() => setIntervalChoice(choice)}
            />
          ))}
          <ChoiceChip
            label="직접 입력"
            selected={intervalChoice === CUSTOM_INTERVAL}
            onPress={() => setIntervalChoice(CUSTOM_INTERVAL)}
          />
        </View>
        {intervalChoice === CUSTOM_INTERVAL ? (
          <View style={styles.customIntervalRow}>
            <TextInput
              value={customIntervalText}
              onChangeText={(value) => setCustomIntervalText(value.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              placeholder="분 단위 숫자"
              placeholderTextColor={colors.textTertiary}
              style={styles.customIntervalInput}
              maxLength={3}
            />
            <Text style={styles.customIntervalSuffix}>분마다</Text>
          </View>
        ) : null}
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
        disabled={Boolean(startBlockedReason)}
      />
      {startBlockedReason ? <Text style={styles.blockedText}>{startBlockedReason}</Text> : null}
      <SecondaryButton label="러닝 탭으로 돌아가기" onPress={() => router.replace('/(tabs)/running')} />
    </Screen>
  );
}

function GoalHeader({ title, derived }: { title: string; derived: boolean }) {
  return (
    <View style={styles.goalHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {derived ? (
        <View style={styles.derivedBadge}>
          <Text style={styles.derivedBadgeText}>자동 계산</Text>
        </View>
      ) : null}
    </View>
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
  goalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s10,
  },
  derivedBadge: {
    backgroundColor: colors.brandWash,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.s10,
    paddingVertical: spacing.xs,
  },
  derivedBadgeText: {
    color: colors.brand,
    fontSize: fontSizes.xxs,
    fontWeight: fontWeights.extraBold,
  },
  blockedText: {
    color: colors.danger,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s14,
  },
  goalSummary: {
    flex: 1,
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  goalSummaryValue: {
    color: colors.brand,
    fontSize: fontSizes.pageTitle,
    fontWeight: fontWeights.extraBold,
  },
  goalSummaryCaption: {
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
    minWidth: 40,
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
  customIntervalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s10,
  },
  customIntervalInput: {
    backgroundColor: colors.surfaceSubtleAlt,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: radii.md,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s10,
    color: colors.textPrimary,
    minWidth: 110,
  },
  customIntervalSuffix: {
    color: colors.textSecondary,
    fontWeight: fontWeights.bold,
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
