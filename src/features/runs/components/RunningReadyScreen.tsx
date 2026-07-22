import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';
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
          <Pressable
            style={styles.coachButton}
            onPress={() => router.push('/solo-coach' as never)}
            accessibilityRole="button"
          >
            <Text style={styles.coachButtonText}>🎧 페이스메이커와 달리기</Text>
            <Text style={styles.coachButtonCaption}>목표 페이스를 정하면 달리는 동안 음성으로 잡아드려요</Text>
          </Pressable>
          <Pressable
            style={styles.coachButton}
            onPress={() => router.push('/ghost-run' as never)}
            accessibilityRole="button"
          >
            <Text style={styles.coachButtonText}>👻 나와의 대결</Text>
            <Text style={styles.coachButtonCaption}>저장해둔 과거의 나와 음성 대결로 달려요</Text>
          </Pressable>
        </>
      ) : null}
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
