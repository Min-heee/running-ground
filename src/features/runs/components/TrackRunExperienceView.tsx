import type { ComponentProps } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { Href } from 'expo-router';
import { Screen } from '@/components/Screen';
import { MatchStartCountdownOverlay } from '@/components/matches/MatchStartCountdownOverlay';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { LiveMatchContainer } from '@/features/runs/components/LiveMatchContainer';
import { RunningReadyScreen } from '@/features/runs/components/RunningReadyScreen';
import {
  TrackRunShellRouter,
  type TrackRunShellKind,
} from '@/features/runs/components/shells/TrackRunShells';

type CountdownEntry = {
  remainingSeconds: number;
  subtitle?: string;
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
  readyScreenProps: ComponentProps<typeof RunningReadyScreen>;
  shellKind: TrackRunShellKind;
  shouldShowReadyScreen: boolean;
  shouldShowRoomArmingOverlay: boolean;
  soloStartCountdownSeconds: number | null;
};

export function TrackRunExperienceView({
  backHref,
  centeredCountdownEntry,
  error,
  fullscreenCountdownEntry,
  isTabMode,
  liveContainerProps,
  liveMatchKey,
  readyScreenProps,
  shellKind,
  shouldShowReadyScreen,
  shouldShowRoomArmingOverlay,
  soloStartCountdownSeconds,
}: TrackRunExperienceViewProps) {
  return (
    <View style={styles.root}>
      <Screen>
        <AuthHeader
          title="실시간 러닝"
          showBack={!isTabMode}
          backHref={backHref}
        />

        <TrackRunShellRouter
          liveContainerProps={liveContainerProps}
          liveMatchKey={liveMatchKey}
          readyScreenProps={readyScreenProps}
          shellKind={shouldShowReadyScreen ? shellKind : 'live'}
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </Screen>
      {fullscreenCountdownEntry ? (
        <MatchStartCountdownOverlay
          title={fullscreenCountdownEntry.title}
          subtitle={fullscreenCountdownEntry.subtitle}
          secondsRemaining={fullscreenCountdownEntry.remainingSeconds}
        />
      ) : null}
      {shouldShowRoomArmingOverlay ? (
        <View style={styles.roomArmingOverlay}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.roomArmingOverlayTitle}>로딩중...</Text>
          <Text style={styles.roomArmingOverlayText}>
            대결 화면을 맞추는 중이에요. 잠시 뒤 모든 참가자에게 같은 카운트다운이 보여요.
          </Text>
        </View>
      ) : null}
      {typeof soloStartCountdownSeconds === 'number' ? (
        <View style={styles.soloStartCountdownOverlay} pointerEvents="none">
          <View style={styles.soloStartCountdownCard}>
            <Text style={styles.soloStartCountdownEyebrow}>READY</Text>
            <Text style={styles.soloStartCountdownTitle}>러닝 시작</Text>
            <Text style={styles.soloStartCountdownNumber}>{soloStartCountdownSeconds}</Text>
            <Text style={styles.soloStartCountdownText}>카운트가 끝나면 기록 측정을 시작해요.</Text>
          </View>
        </View>
      ) : null}
      {centeredCountdownEntry ? (
        <MatchStartCountdownOverlay
          secondsRemaining={centeredCountdownEntry.remainingSeconds}
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
    color: '#B42318',
    fontWeight: '700',
    marginTop: 12,
  },
  roomArmingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17, 24, 39, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 28,
    zIndex: 30,
  },
  roomArmingOverlayTitle: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
  },
  roomArmingOverlayText: {
    color: '#D6D9F9',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 22,
  },
  soloStartCountdownOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    zIndex: 35,
  },
  soloStartCountdownCard: {
    width: '100%',
    maxWidth: 280,
    borderRadius: 30,
    backgroundColor: 'rgba(17, 24, 39, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(141, 132, 255, 0.45)',
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 22,
    shadowColor: '#111827',
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
    elevation: 8,
  },
  soloStartCountdownEyebrow: {
    color: '#8D84FF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.6,
  },
  soloStartCountdownTitle: {
    marginTop: 8,
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
  },
  soloStartCountdownNumber: {
    marginTop: 10,
    color: '#FFFFFF',
    fontSize: 88,
    fontWeight: '900',
    lineHeight: 96,
  },
  soloStartCountdownText: {
    color: '#D6D9F9',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
});
