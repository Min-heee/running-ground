import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSizes, fontWeights, radii, spacing } from '@/theme/tokens';
import { isSocialLoginEnabled } from '@/config/featureFlags';
import type { SocialProvider } from '@/features/auth/hooks/useSocialLogin';

type SocialLoginButtonsProps = {
  busyProvider: SocialProvider | null;
  onPress: (provider: SocialProvider) => void;
  disabled?: boolean;
};

// Each provider mandates its own official button palette, so these stay as fixed brand
// colors rather than theme tokens (same exemption as other external-brand assets).
const PROVIDER_BUTTONS: { provider: SocialProvider; label: string; background: string; text: string; border: string }[] = [
  { provider: 'kakao', label: '카카오로 시작하기', background: '#FEE500', text: '#191600', border: '#FEE500' },
  { provider: 'naver', label: '네이버로 시작하기', background: '#03C75A', text: '#FFFFFF', border: '#03C75A' },
  { provider: 'google', label: 'Google로 시작하기', background: '#FFFFFF', text: '#1F1F1F', border: '#DADCE0' },
];

export function SocialLoginButtons({ busyProvider, onPress, disabled }: SocialLoginButtonsProps) {
  // P0-3: while social login is gated off, render NOTHING — no divider dangling,
  // no buttons — so a store reviewer can't tap a provider whose backend keys are
  // unset (App Store Review 2.1 rejection vector). The component stays intact for
  // a later flip of SOCIAL_LOGIN_ENABLED.
  if (!isSocialLoginEnabled()) {
    return null;
  }

  const locked = disabled || busyProvider !== null;

  return (
    <View style={styles.container}>
      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>간편 로그인</Text>
        <View style={styles.dividerLine} />
      </View>

      {PROVIDER_BUTTONS.map(({ provider, label, background, text, border }) => {
        const isBusy = busyProvider === provider;
        return (
          <Pressable
            key={provider}
            style={[
              styles.button,
              { backgroundColor: background, borderColor: border },
              locked && !isBusy ? styles.dimmed : null,
            ]}
            onPress={() => onPress(provider)}
            disabled={locked}
          >
            {isBusy ? (
              <ActivityIndicator color={text} />
            ) : (
              <Text style={[styles.buttonText, { color: text }]}>{label}</Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.s12, marginTop: spacing.s16 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s12, marginBottom: spacing.xs },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.borderMuted },
  dividerText: { color: colors.textTertiary, fontSize: fontSizes.sm, fontWeight: fontWeights.bold },
  button: {
    borderRadius: radii.md,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontWeight: fontWeights.extraBold, fontSize: fontSizes.rank },
  dimmed: { opacity: 0.5 },
});
