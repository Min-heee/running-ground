import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { MatchSetupSection } from '@/features/runs/components/MatchSetupSection';
import { UpcomingMatchList } from '@/features/runs/components/UpcomingMatchList';
import { fixedColors, fontSizes, fontWeights, radii, spacing } from '@/theme/tokens';

type RunningReadyScreenProps = {
  bottomInset: number;
  upcomingMatchesProps: ComponentProps<typeof UpcomingMatchList>;
  matchSetupProps: ComponentProps<typeof MatchSetupSection>;
  readyActionLabel: string | null;
  readyActionLoadingLabel?: string;
  readyActionDisabled?: boolean;
  onReadyAction: () => void;
};

export function RunningReadyScreen({
  bottomInset,
  upcomingMatchesProps,
  matchSetupProps,
  readyActionLabel,
  readyActionLoadingLabel,
  readyActionDisabled = false,
  onReadyAction,
}: RunningReadyScreenProps) {
  const readyCardStyle: ViewStyle = {
    paddingBottom: 18 + Math.max(bottomInset, 10),
  };

  return (
    <Card style={[styles.readyCard, readyCardStyle]}>
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
          정하고 음성 코칭과 함께 솔로 러닝을 시작하는 흐름. */}
      <Pressable
        style={styles.coachButton}
        onPress={() => router.push('/solo-coach' as never)}
        accessibilityRole="button"
      >
        <Text style={styles.coachButtonText}>🎧 페이스메이커와 달리기</Text>
        <Text style={styles.coachButtonCaption}>목표 페이스를 정하면 달리는 동안 음성으로 잡아드려요</Text>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  readyCard: {
    gap: spacing.s16,
    backgroundColor: fixedColors.textPrimary,
    paddingTop: spacing.s18,
    paddingBottom: spacing.s18,
  },
  // The ready card sits on the fixed dark chrome (fixedColors), so the coach
  // button uses fixed colors too — identical in both themes.
  coachButton: {
    alignItems: 'center',
    borderColor: 'rgba(255, 255, 255, 0.28)',
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.xs,
    paddingVertical: spacing.s12,
  },
  coachButtonText: {
    color: fixedColors.white,
    fontSize: fontSizes.rank,
    fontWeight: fontWeights.extraBold,
  },
  coachButtonCaption: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: fontSizes.sm,
  },
});
