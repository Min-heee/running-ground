import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { MatchSetupSection } from '@/features/runs/components/MatchSetupSection';
import { UpcomingMatchList } from '@/features/runs/components/UpcomingMatchList';
import { GhostSavePromptCard } from '@/features/runs/ghostRun/GhostSavePromptCard';
import { colors, fixedColors, fontSizes, fontWeights, radii, spacing } from '@/theme/tokens';

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
      {/* 경찰과 도둑런의 시작 버튼은 경기장 지도 카드 안에 있다 — 기존 chase 시작
          플로우(입장→GPS 시작)를 그대로 태우기 위해 readyAction을 내려보낸다. */}
      <MatchSetupSection {...matchSetupProps} onChaseStart={onReadyAction} />

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
      <Feather name="chevron-right" size={18} color="rgba(199, 210, 254, 0.85)" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // 검은 배경 제거 (오너 2026-07-31): 러닝 준비 카드도 다른 탭과 같은 앱 카드 표면을 쓴다.
  // (Card 기본값 = colors.surface — 라이트 유리 / 다크 유리)
  readyCard: {
    gap: spacing.s16,
    paddingTop: spacing.s18,
    paddingBottom: spacing.s18,
  },
  // Vertical metrics mirror the base Button (paddingVertical s16 + radii.lg +
  // fontSizes.button) so these rows sit at the same height as 바로 러닝 시작.
  // Violet-tinted glass (오너 2026-07-27): plain white glass read as static
  // text, not a button. 채움은 반투명 브랜드라 라이트/다크 양쪽에서 성립하지만, 글자색은
  // 더 이상 '항상 어두운 카드' 전제를 쓸 수 없다 — 배경이 걷히면서 흰 글씨는 안 보인다.
  featureRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(109, 94, 247, 0.20)',
    borderColor: 'rgba(142, 123, 255, 0.50)',
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.s12,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s16,
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
    color: colors.textPrimary,
    flex: 1,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.extraBold,
  },
});
