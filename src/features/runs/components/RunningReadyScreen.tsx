import type { ComponentProps } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { MatchSetupSection } from '@/features/runs/components/MatchSetupSection';
import { SoloRunHeroPanel } from '@/features/runs/components/SoloRunHeroPanel';
import { UpcomingMatchList } from '@/features/runs/components/UpcomingMatchList';
import { GhostSavePromptCard } from '@/features/runs/ghostRun/GhostSavePromptCard';
import { spacing } from '@/theme/tokens';

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
    <View style={[styles.readyCard, readyCardStyle]}>
      {/* 방금 끝난 혼자러닝의 나와의 대결 저장 프롬프트 — 후보가 있을 때만 렌더. */}
      <GhostSavePromptCard />
      <UpcomingMatchList {...upcomingMatchesProps} />
      {/* 경찰과 도둑런의 시작 버튼은 경기장 지도 카드 안에 있다 — 기존 chase 시작
          플로우(입장→GPS 시작)를 그대로 태우기 위해 readyAction을 내려보낸다. */}
      <MatchSetupSection {...matchSetupProps} onChaseStart={onReadyAction} />

      {/* 혼자 러닝은 시작이 이 화면의 목적 자체라 원형 히어로로 세운다 (시안 B). 나머지
          모드는 설정 패널 아래에 일반 CTA가 붙는 기존 형태 그대로. 페이스메이커·자신과
          대결은 솔로 전용이라 히어로 안에 함께 들어간다. */}
      {showSoloCoachEntry && readyActionLabel ? (
        <SoloRunHeroPanel
          startLabel={readyActionLoadingLabel ?? readyActionLabel}
          startDisabled={readyActionDisabled}
          onStart={onReadyAction}
          onOpenPacemaker={() => router.push('/solo-coach' as never)}
          onOpenGhostRun={() => router.push('/ghost-run' as never)}
        />
      ) : readyActionLabel ? (
        <PrimaryButton
          label={readyActionLoadingLabel ?? readyActionLabel}
          onPress={onReadyAction}
          disabled={readyActionDisabled}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // 배경 카드 없음 (오너 2026-07-31): 검은 카드에 이어 흰 카드까지 걷어내고, 준비 화면
  // 콘텐츠를 페이지 배경 위에 바로 놓는다. 가로 여백은 Screen이 이미 주므로 여기선 주지
  // 않는다 — 카드가 있을 때처럼 안쪽으로 한 번 더 들여쓰면 화면이 좁아 보인다.
  readyCard: {
    gap: spacing.s16,
    paddingTop: spacing.s12,
    paddingBottom: spacing.s18,
  },
});
