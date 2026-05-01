import { StyleSheet, Text, View } from 'react-native';

export function MatchStartCountdownOverlay({
  title,
  subtitle,
  secondsRemaining,
}: {
  title: string;
  subtitle: string;
  secondsRemaining: number;
}) {
  return (
    <View style={styles.overlay}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>MATCH START</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        <Text style={styles.countdown}>{secondsRemaining}</Text>
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
    paddingHorizontal: 24,
    zIndex: 100,
  },
  content: {
    alignItems: 'center',
    gap: 10,
  },
  eyebrow: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 20,
  },
  countdown: {
    marginTop: 10,
    color: '#FFFFFF',
    fontSize: 96,
    fontWeight: '900',
    lineHeight: 108,
  },
});
