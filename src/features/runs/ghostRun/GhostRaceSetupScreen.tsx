import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';

import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { SOLO_COACH_INTERVAL_CHOICES } from '@/features/runs/soloCoach/soloCoachModel';
import { clearSoloCoach } from '@/features/runs/soloCoach/soloCoachStore';
import { colors, fontSizes, fontWeights, radii, spacing } from '@/theme/tokens';
import {
  formatGhostDate,
  formatGhostDistance,
  formatGhostDuration,
  formatGhostPace,
} from './ghostDisplay';
import { armGhostRace } from './ghostRaceStore';
import { deleteGhostSlot, loadGhostSlots } from './ghostStorage';
import type { GhostRecord } from './ghostTrackCodec';

// 나와의 대결 대기방: 저장된 기록(최대 3개) 중 하나를 골라 과거의 나와 음성
// 대결로 달린다. 시작하면 페이스메이커 설정은 해제된다 (동시 코칭 금지).

const CUSTOM_INTERVAL = -1;

export default function GhostRaceSetupScreen() {
  const [slots, setSlots] = useState<(GhostRecord | null)[] | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [intervalChoice, setIntervalChoice] = useState<number>(2);
  const [customIntervalText, setCustomIntervalText] = useState('');
  const [announceGap, setAnnounceGap] = useState(true);
  const [announceElapsed, setAnnounceElapsed] = useState(false);
  const [announceDistance, setAnnounceDistance] = useState(true);

  useEffect(() => {
    void loadGhostSlots().then((loaded) => {
      setSlots(loaded);
      const firstFilled = loaded.findIndex((entry) => entry !== null);
      setSelectedSlot(firstFilled === -1 ? null : firstFilled);
    });
  }, []);

  const savedRecords = useMemo(
    () => (slots ?? []).map((record, slot) => ({ record, slot })).filter((entry) => entry.record !== null),
    [slots],
  );

  const selectedRecord = selectedSlot !== null ? slots?.[selectedSlot] ?? null : null;

  const customIntervalMinutes = useMemo(() => {
    const parsed = Number.parseInt(customIntervalText, 10);
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : null;
  }, [customIntervalText]);

  const effectiveIntervalMinutes = intervalChoice === CUSTOM_INTERVAL
    ? customIntervalMinutes
    : intervalChoice;

  const startBlockedReason = !selectedRecord
    ? '대결할 기록을 선택해주세요.'
    : !announceGap && !announceElapsed && !announceDistance
      ? '알려드릴 항목을 하나 이상 켜주세요.'
      : effectiveIntervalMinutes === null
        ? '피드백 주기를 1분 이상 숫자로 입력해주세요.'
        : null;

  const handleDeleteSlot = (slot: number) => {
    void deleteGhostSlot(slot).then(() => loadGhostSlots()).then((loaded) => {
      setSlots(loaded);
      setSelectedSlot((current) => {
        if (current !== slot) {
          return current;
        }
        const firstFilled = loaded.findIndex((entry) => entry !== null);
        return firstFilled === -1 ? null : firstFilled;
      });
    });
  };

  const handleStart = () => {
    if (startBlockedReason || !selectedRecord || effectiveIntervalMinutes === null) {
      return;
    }

    clearSoloCoach();
    armGhostRace({
      ghost: selectedRecord,
      intervalMinutes: effectiveIntervalMinutes,
      announceGap,
      announceElapsed,
      announceDistance,
    });
    router.replace('/(tabs)/running');
  };

  return (
    <Screen>
      <AuthHeader
        title="나와의 대결"
        subtitle=""
        showBack
        backHref="/(tabs)/running"
      />

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>대결할 기록 선택</Text>
        {slots === null ? (
          <Text style={styles.helperText}>기록을 불러오는 중이에요...</Text>
        ) : savedRecords.length === 0 ? (
          <Text style={styles.helperText}>
            저장된 기록이 아직 없어요. 혼자러닝을 끝내면 대결 기록으로 저장할 수 있어요.
          </Text>
        ) : (
          savedRecords.map(({ record, slot }) => {
            const selected = slot === selectedSlot;
            return (
              <Pressable
                key={slot}
                style={[styles.recordRow, selected && styles.recordRowSelected]}
                onPress={() => setSelectedSlot(slot)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <View style={styles.recordCopy}>
                  <Text style={[styles.recordTitle, selected && styles.recordTitleSelected]}>
                    {formatGhostDate(record as GhostRecord)} 러닝
                  </Text>
                  <Text style={styles.recordMeta}>
                    {formatGhostDistance(record as GhostRecord)} · {formatGhostDuration(record as GhostRecord)} · {formatGhostPace(record as GhostRecord)}
                  </Text>
                </View>
                <Pressable
                  onPress={() => handleDeleteSlot(slot)}
                  accessibilityRole="button"
                  hitSlop={8}
                >
                  <Text style={styles.recordDelete}>삭제</Text>
                </Pressable>
              </Pressable>
            );
          })
        )}
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
          label="간격 비교"
          caption="과거의 나보다 앞서는지 뒤처지는지 알려드려요."
          value={announceGap}
          onValueChange={setAnnounceGap}
        />
        <ToggleRow
          label="경과 시간"
          caption="지금까지 달린 시간을 알려드려요."
          value={announceElapsed}
          onValueChange={setAnnounceElapsed}
        />
        <ToggleRow
          label="거리 진행"
          caption="현재 거리와 결승선까지 남은 거리를 알려드려요."
          value={announceDistance}
          onValueChange={setAnnounceDistance}
        />
      </Card>

      <PrimaryButton
        label="나와의 대결 시작"
        onPress={handleStart}
        disabled={Boolean(startBlockedReason)}
      />
      {startBlockedReason ? <Text style={styles.blockedText}>{startBlockedReason}</Text> : null}
      <SecondaryButton label="러닝 탭으로 돌아가기" onPress={() => router.replace('/(tabs)/running')} />
    </Screen>
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
    lineHeight: 20,
  },
  blockedText: {
    color: colors.danger,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
  },
  recordRow: {
    alignItems: 'center',
    backgroundColor: colors.surfaceSubtleAlt,
    borderColor: colors.borderMuted,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.s10,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s12,
  },
  recordRowSelected: {
    backgroundColor: colors.brandWash,
    borderColor: colors.brand,
  },
  recordCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  recordTitle: {
    color: colors.textPrimary,
    fontWeight: fontWeights.extraBold,
    fontSize: fontSizes.rank,
  },
  recordTitleSelected: {
    color: colors.brand,
  },
  recordMeta: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
  },
  recordDelete: {
    color: colors.danger,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
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
