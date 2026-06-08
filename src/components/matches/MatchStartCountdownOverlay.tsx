import { StyleSheet, Text, View } from 'react-native';
import { useLocalCountdownSeconds } from '@/components/matches/useLocalCountdownSeconds';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';

export function MatchStartCountdownOverlay({
  countdownKey,
  secondsRemaining,
  targetMs,
  title,
  subtitle,
  variant = 'fullscreen',
}: {
  countdownKey?: string | null;
  secondsRemaining: number;
  targetMs?: number | null;
  title?: string;
  subtitle?: string;
  variant?: 'fullscreen' | 'centered';
}) {
  const displayedSecondsRemaining = useLocalCountdownSeconds({
    countdownKey,
    secondsRemaining,
    targetMs,
  });

  if (displayedSecondsRemaining === null) {
    return null;
  }

  return (
    <View style={[styles.overlay, variant === 'centered' ? styles.overlayCentered : null]} pointerEvents="none">
      <View style={styles.content}>
        {variant === 'fullscreen' ? (
          <>
            <Text style={styles.eyebrow}>MATCH START</Text>
            {title ? <Text style={styles.title}>{title}</Text> : null}
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </>
        ) : null}
        <Text style={styles.countdown}>{displayedSecondsRemaining}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(109, 94, 247, 0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.s24,
    zIndex: 100,
  },
  overlayCentered: {
    backgroundColor: 'transparent',
  },
  content: {
    alignItems: 'center',
    gap: spacing.s10,
  },
  eyebrow: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
    letterSpacing: 1,
  },
  title: {
    color: colors.white,
    fontSize: fontSizes.summaryValue,
    fontWeight: fontWeights.extraBold,
    textAlign: 'center',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
    textAlign: 'center',
    lineHeight: 20,
  },
  countdown: {
    marginTop: spacing.s10,
    color: colors.white,
    fontSize: 96,
    fontWeight: fontWeights.black,
    lineHeight: 108,
  },
});
