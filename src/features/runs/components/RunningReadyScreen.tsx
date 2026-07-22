import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { MatchSetupSection } from '@/features/runs/components/MatchSetupSection';
import { UpcomingMatchList } from '@/features/runs/components/UpcomingMatchList';
import { GhostSavePromptCard } from '@/features/runs/ghostRun/GhostSavePromptCard';
import { fixedColors, fontSizes, fontWeights, radii, spacing } from '@/theme/tokens';

type RunningReadyScreenProps = {
  bottomInset: number;
  upcomingMatchesProps: ComponentProps<typeof UpcomingMatchList>;
  matchSetupProps: ComponentProps<typeof MatchSetupSection>;
  readyActionLabel: string | null;
  readyActionLoadingLabel?: string;
  readyActionDisabled?: boolean;
  onReadyAction: () => void;
  // 페이스메이커 entry — solo mode only (hidden for duel/group/party).
  showSoloCoachEntry?: boolean;
};

export function RunningReadyScreen({
  bottomInset,
  upcomingMatchesProps,
  matchSetupProps,
  readyActionLabel,
  readyActionLoadingLabel,
  readyActionDisabled = false,
  onReadyAction,
  showSoloCoachEntry = false,
}: RunningReadyScreenProps) {
  const readyCardStyle: ViewStyle = {
    paddingBottom: 18 + Math.max(bottomInset, 10),
  };

  return (
    <Card style={[styles.readyCard, readyCardStyle]}>
      {/* 방금 끝난 혼자러닝의 나와의 대결 저장 프롬프트 — 후보가 있을 때만 렌더. */}
      <GhostSavePromptCard />
      <UpcomingMatchList {...upcomingMatchesProps} />
      <MatchSetupSection {...matchSetupProps} />

      {readyActionLabel ? (
        <PrimaryButton
          label={readyActionLoadingLabel ?? readyActionLabel}
          onPress={onReadyAction}
          disabled={readyActionDisabled}
        />
      ) : null}

      {/* 페이스메이커 대기방 진입 (오너 요청 2026-07-22): 목표 페이스/거리/시간을
          정하고 음성 코칭과 함께 달리는 솔로 전용 흐름 — 혼자러닝 모드에서만 노출. */}
      {showSoloCoachEntry ? (
        <>
          <SoloFeatureRow
            label="페이스메이커와 달리기"
            onPress={() => router.push('/solo-coach' as never)}
          />
          <SoloFeatureRow
            label="자신과 대결"
            onPress={() => router.push('/ghost-run' as never)}
          />
        </>
      ) : null}
    </Card>
  );
}

// Modern-simple solo feature row: a thin brand accent bar · left label ·
// chevron, on a glassy translucent fill over the fixed dark ready card.
function SoloFeatureRow({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.featureRow, pressed && styles.featureRowPressed]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <View style={styles.featureAccentBar} />
      <Text style={styles.featureLabel}>{label}</Text>
      <Feather name="chevron-right" size={18} color="rgba(255, 255, 255, 0.45)" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  readyCard: {
    gap: spacing.s16,
    backgroundColor: fixedColors.textPrimary,
    paddingTop: spacing.s18,
    paddingBottom: spacing.s18,
  },
  featureRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderColor: 'rgba(255, 255, 255, 0.13)',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.s12,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s12,
  },
  featureRowPressed: {
    backgroundColor: 'rgba(109, 94, 247, 0.28)',
    borderColor: fixedColors.brand,
  },
  featureAccentBar: {
    backgroundColor: fixedColors.brand,
    borderRadius: 2,
    height: 18,
    width: 3,
  },
  featureLabel: {
    color: fixedColors.white,
    flex: 1,
    fontSize: fontSizes.rank,
    fontWeight: fontWeights.extraBold,
  },
});
