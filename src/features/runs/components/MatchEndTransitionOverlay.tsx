import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';
import {
  resolveOverlayWatchdogPhase,
  type MatchEndOverlayWatchdogPhase,
} from '@/features/runs/lifecycle/matchEndOverlayWatchdog';

// C-1 — the 결과 저장 중 overlay, extracted from TrackRunExperienceView so it can carry its own
// watchdog. The overlay covers the whole live shell from the moment a match-ending action is
// pressed until the run-detail replace lands; before this extraction it had NO exit and every
// save-chain timeout is a JS setTimeout that suspends while backgrounded (H1) — so it could sit
// forever. The watchdog is wall-clock (Date.now() deltas via resolveOverlayWatchdogPhase): a 1s
// interval re-evaluates while foregrounded, and an AppState 'active' listener re-evaluates
// immediately on resume, so a screen-off gap jumps phases the instant the user returns.
//
// Phases: ≥12s honest slow copy → ≥20s a 기다리지 않고 나가기 escape (abandons the WAIT, never
// the in-flight save — see onAbandon wiring in TrackRunExperienceRuntimeModel) → ≥40s the
// abandon auto-fires once. 결과 저장 중 can no longer be infinite.

const WATCHDOG_TICK_MS = 1_000;

type MatchEndTransitionOverlayProps = {
  visible: boolean;
  onAbandon?: () => void;
};

export function MatchEndTransitionOverlay({ visible, onAbandon }: MatchEndTransitionOverlayProps) {
  const [phase, setPhase] = useState<MatchEndOverlayWatchdogPhase>('saving');
  const startMsRef = useRef<number | null>(null);
  const autoAbandonFiredRef = useRef(false);
  const onAbandonRef = useRef(onAbandon);
  onAbandonRef.current = onAbandon;

  useEffect(() => {
    if (!visible) {
      // Reset per visible episode: the next save gets a fresh watchdog window.
      startMsRef.current = null;
      autoAbandonFiredRef.current = false;
      setPhase('saving');
      return;
    }

    startMsRef.current = startMsRef.current ?? Date.now();

    const evaluatePhase = () => {
      const startMs = startMsRef.current;
      if (startMs === null) {
        return;
      }
      const nextPhase = resolveOverlayWatchdogPhase(Date.now() - startMs);
      setPhase(nextPhase);
      if (nextPhase === 'expired' && !autoAbandonFiredRef.current) {
        // Hard cap: invoke the abandon exactly once per visible episode. The in-flight save
        // keeps running; this only releases the user from the blocking overlay.
        autoAbandonFiredRef.current = true;
        onAbandonRef.current?.();
      }
    };

    evaluatePhase();
    const interval = setInterval(evaluatePhase, WATCHDOG_TICK_MS);
    // H1-proof: interval timers suspend while backgrounded, so a resume after screen-off
    // re-evaluates immediately and jumps the phase by the full wall-clock gap.
    const appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        evaluatePhase();
      }
    });

    return () => {
      clearInterval(interval);
      appStateSubscription.remove();
    };
  }, [visible]);

  if (!visible) {
    return null;
  }

  return (
    <View style={styles.overlay}>
      <ActivityIndicator size="large" color={colors.white} />
      <Text style={styles.title}>결과 저장 중...</Text>
      <Text style={styles.text}>
        대결을 정리하고 기록 상세로 이동해요.
      </Text>
      {phase !== 'saving' ? (
        <Text style={styles.slowText}>
          서버 응답이 늦어지고 있어요. 계속 저장 중이에요…
        </Text>
      ) : null}
      {(phase === 'exit-offer' || phase === 'expired') && onAbandon ? (
        <Pressable style={styles.exitButton} onPress={onAbandon}>
          <Text style={styles.exitButtonText}>기다리지 않고 나가기</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    // Fully opaque: the shell underneath churns through live/matching states while the
    // save runs, and a translucent cover let that thrash bleed through.
    backgroundColor: colors.navyInk,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s10,
    paddingHorizontal: 28,
    zIndex: 40,
  },
  title: {
    color: colors.white,
    fontSize: fontSizes.hero,
    fontWeight: fontWeights.extraBold,
  },
  text: {
    color: colors.lavenderSoft,
    fontSize: fontSizes.rank,
    fontWeight: fontWeights.semibold,
    textAlign: 'center',
    lineHeight: 22,
  },
  slowText: {
    color: colors.lavenderSoft,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    textAlign: 'center',
    lineHeight: 20,
    opacity: 0.9,
  },
  exitButton: {
    marginTop: spacing.s12,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.lavenderSoft,
    paddingHorizontal: spacing.s24,
    paddingVertical: spacing.s12,
  },
  exitButtonText: {
    color: colors.white,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.extraBold,
  },
});
