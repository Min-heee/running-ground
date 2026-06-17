import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Href } from 'expo-router';
import { Screen } from '@/components/Screen';
import { MatchStartCountdownOverlay } from '@/components/matches/MatchStartCountdownOverlay';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { TabHeader } from '@/components/ui/TabHeader';
import { LiveMatchContainer } from '@/features/runs/components/LiveMatchContainer';
import { RunningReadyScreen } from '@/features/runs/components/RunningReadyScreen';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';
import {
  TrackRunShellRouter,
  type TrackRunShellKind,
} from '@/features/runs/components/shells/TrackRunShells';

type CountdownEntry = {
  countdownKey?: string | null;
  remainingSeconds: number;
  subtitle?: string;
  targetMs?: number | null;
  title?: string;
};

type TrackRunExperienceViewProps = {
  backHref: Href;
  centeredCountdownEntry: CountdownEntry | null;
  error: string | null;
  fullscreenCountdownEntry: CountdownEntry | null;
  isTabMode: boolean;
  liveContainerProps: ComponentProps<typeof LiveMatchContainer>;
  liveMatchKey: string | null;
  isForceResettingRunningMatch: boolean;
  onForceResetRunningMatch: () => void;
  readyScreenProps: ComponentProps<typeof RunningReadyScreen>;
  shellKind: TrackRunShellKind;
  shouldShowReadyScreen: boolean;
  showForceResetAction: boolean;
  shouldShowRoomArmingOverlay: boolean;
  roomArmingDebugInfo?: string;
  onLeaveArmingMatch?: () => void;
  shouldShowMatchEndTransitionOverlay?: boolean;
  soloStartCountdownSeconds: number | null;
};

export function TrackRunExperienceView({
  backHref,
  centeredCountdownEntry,
  error,
  fullscreenCountdownEntry,
  isTabMode,
  isForceResettingRunningMatch,
  liveContainerProps,
  liveMatchKey,
  onForceResetRunningMatch,
  readyScreenProps,
  shellKind,
  shouldShowReadyScreen,
  showForceResetAction,
  shouldShowRoomArmingOverlay,
  roomArmingDebugInfo,
  onLeaveArmingMatch,
  shouldShowMatchEndTransitionOverlay,
  soloStartCountdownSeconds,
}: TrackRunExperienceViewProps) {
  return (
    <View style={styles.root}>
      <Screen>
        {isTabMode ? (
          <TabHeader title="러닝" />
        ) : (
          <AuthHeader
            title="실시간 러닝"
            showBack
            backHref={backHref}
          />
        )}

        <TrackRunShellRouter
          liveContainerProps={liveContainerProps}
          liveMatchKey={liveMatchKey}
          readyScreenProps={readyScreenProps}
          shellKind={shouldShowReadyScreen ? shellKind : 'live'}
        />

        {error ? (
          <View style={styles.errorBlock}>
            <Text style={styles.errorText}>{error}</Text>
            {showForceResetAction ? (
              <>
                <Pressable
                  style={[
                    styles.forceResetButton,
                    isForceResettingRunningMatch ? styles.forceResetButtonDisabled : undefined,
                  ]}
                  onPress={isForceResettingRunningMatch ? undefined : onForceResetRunningMatch}
                  disabled={isForceResettingRunningMatch}
                >
                  <Text style={styles.forceResetButtonText}>
                    {isForceResettingRunningMatch ? '초기화 중...' : '매칭 상태 강제 초기화'}
                  </Text>
                </Pressable>
                <Text style={styles.forceResetHelperText}>
                  진행 중인 모든 방·매치 상태를 정리해요. 진행 중인 대결은 패배 처리될 수 있어요.
                </Text>
              </>
            ) : null}
          </View>
        ) : null}
      </Screen>
      {fullscreenCountdownEntry ? (
        <MatchStartCountdownOverlay
          title={fullscreenCountdownEntry.title}
          subtitle={fullscreenCountdownEntry.subtitle}
          secondsRemaining={fullscreenCountdownEntry.remainingSeconds}
          targetMs={fullscreenCountdownEntry.targetMs}
          countdownKey={fullscreenCountdownEntry.countdownKey}
        />
      ) : null}
      {shouldShowRoomArmingOverlay ? (
        <View style={styles.roomArmingOverlay}>
          <ActivityIndicator size="large" color={colors.white} />
          <Text style={styles.roomArmingOverlayTitle}>로딩중...</Text>
          <Text style={styles.roomArmingOverlayText}>
            대결 화면을 맞추는 중이에요. 잠시 뒤 모든 참가자에게 같은 카운트다운이 보여요.
          </Text>
          {/* Always-visible safety net: a guest whose countdown-ready ACK never lands must
              never be trapped on this overlay. This force-leave control is shown the whole
              time the arming overlay is up so there is always a way out. */}
          {onLeaveArmingMatch ? (
            <Pressable
              style={styles.armingLeaveButton}
              onPress={onLeaveArmingMatch}
              accessibilityRole="button"
              accessibilityLabel="대결 준비 나가기"
            >
              <Text style={styles.armingLeaveButtonText}>나가기</Text>
            </Pressable>
          ) : null}
          {/* TEMP diagnostic: build tag + arming state (why it's stuck). Remove later. */}
          <Text style={{ color: colors.white, fontSize: 11, marginTop: spacing.md, opacity: 0.75 }}>
            RG-A3 · {roomArmingDebugInfo ?? '-'}
          </Text>
        </View>
      ) : null}
      {shouldShowMatchEndTransitionOverlay ? (
        <View style={[styles.roomArmingOverlay, styles.matchEndTransitionOverlay]}>
          <ActivityIndicator size="large" color={colors.white} />
          <Text style={styles.roomArmingOverlayTitle}>결과 저장 중...</Text>
          <Text style={styles.roomArmingOverlayText}>
            대결을 정리하고 기록 상세로 이동해요.
          </Text>
        </View>
      ) : null}
      {typeof soloStartCountdownSeconds === 'number' ? (
        <View style={styles.soloStartCountdownOverlay} pointerEvents="none">
          <View style={styles.soloStartCountdownCard}>
            <Text style={styles.soloStartCountdownEyebrow}>READY</Text>
            <Text style={styles.soloStartCountdownTitle}>러닝 시작</Text>
            <Text style={styles.soloStartCountdownNumber}>{soloStartCountdownSeconds}</Text>
            <Text style={styles.soloStartCountdownText}>
              GPS를 준비하고 있어요. 카운트가 끝나면 기록 측정을 시작해요.
            </Text>
          </View>
        </View>
      ) : null}
      {centeredCountdownEntry ? (
        <MatchStartCountdownOverlay
          secondsRemaining={centeredCountdownEntry.remainingSeconds}
          targetMs={centeredCountdownEntry.targetMs}
          countdownKey={centeredCountdownEntry.countdownKey}
          variant="centered"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  errorText: {
    color: colors.danger,
    fontWeight: fontWeights.bold,
  },
  errorBlock: {
    gap: spacing.xxl,
    marginTop: spacing.s12,
  },
  forceResetButton: {
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderRadius: 14,
    paddingVertical: spacing.s12,
  },
  forceResetButtonDisabled: {
    opacity: 0.55,
  },
  forceResetButtonText: {
    color: colors.white,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.extraBold,
  },
  forceResetHelperText: {
    color: colors.textTertiary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  roomArmingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17, 24, 39, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s10,
    paddingHorizontal: 28,
    zIndex: 30,
  },
  matchEndTransitionOverlay: {
    // Fully opaque: the shell underneath churns through live/matching states while the
    // save runs, and a translucent cover let that thrash bleed through.
    backgroundColor: colors.navyInk,
    zIndex: 40,
  },
  roomArmingOverlayTitle: {
    color: colors.white,
    fontSize: fontSizes.hero,
    fontWeight: fontWeights.extraBold,
  },
  roomArmingOverlayText: {
    color: colors.lavenderSoft,
    fontSize: fontSizes.rank,
    fontWeight: fontWeights.semibold,
    textAlign: 'center',
    lineHeight: 22,
  },
  armingLeaveButton: {
    marginTop: spacing.s12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.white,
    paddingVertical: spacing.s10,
    paddingHorizontal: spacing.xxl,
  },
  armingLeaveButtonText: {
    color: colors.white,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.extraBold,
  },
  soloStartCountdownOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.62)',
    justifyContent: 'center',
    paddingHorizontal: 28,
    zIndex: 35,
  },
  soloStartCountdownCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 34,
    backgroundColor: 'rgba(17, 24, 39, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(141, 132, 255, 0.45)',
    alignItems: 'center',
    paddingVertical: 34,
    paddingHorizontal: 26,
    shadowColor: colors.textPrimary,
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
    elevation: 8,
  },
  soloStartCountdownEyebrow: {
    color: colors.brandLavender,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.black,
    letterSpacing: 1.6,
  },
  soloStartCountdownTitle: {
    marginTop: spacing.xxl,
    color: colors.white,
    fontSize: fontSizes.summaryValue,
    fontWeight: fontWeights.black,
  },
  soloStartCountdownNumber: {
    marginTop: spacing.s10,
    color: colors.white,
    fontSize: 120,
    fontWeight: fontWeights.black,
    lineHeight: 128,
  },
  soloStartCountdownText: {
    color: colors.lavenderSoft,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
  },
});
