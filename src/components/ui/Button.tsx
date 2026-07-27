import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type ButtonVariant = 'primary' | 'secondary' | 'tinted';

type ButtonProps = {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  variant?: ButtonVariant;
};

export function Button({ label, onPress, disabled = false, variant = 'primary' }: ButtonProps) {
  const isSecondary = variant === 'secondary';
  const isTinted = variant === 'tinted';

  // 테마 토큰(surface/border/text*)은 렌더 시점에 읽는다: 이 모듈은 RouteErrorBoundary 재수출
  // 경로로 테마 게이트보다 먼저 import되므로, StyleSheet에 구우면 라이트 모드 부팅에서도 다크
  // 값이 박제된다. brand/white는 양 모드 공통이라 그대로 구워도 안전.
  return (
    <Pressable
      style={[
        styles.button,
        isSecondary
          ? { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }
          : isTinted
            ? { backgroundColor: colors.brandWash, borderWidth: 1, borderColor: colors.brandSoftBorder }
            : styles.primaryButton,
        !isSecondary && disabled ? styles.primaryButtonDisabled : undefined,
        isSecondary && disabled
          ? { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSoft }
          : undefined,
      ]}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      android_ripple={{ color: 'rgba(0, 0, 0, 0.12)' }}
    >
      <Text
        style={[
          styles.text,
          isSecondary
            ? [styles.secondaryText, { color: colors.textPrimary }]
            : isTinted
              ? [styles.primaryText, { color: colors.brandDeep }]
              : styles.primaryText,
          isSecondary && disabled ? { color: colors.textTertiary } : undefined,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: radii.lg,
    paddingVertical: spacing.s16,
    alignItems: 'center',
    overflow: 'hidden',
  },
  primaryButton: {
    backgroundColor: colors.brand,
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  text: {
    fontSize: fontSizes.button,
  },
  primaryText: {
    color: colors.white,
    fontWeight: fontWeights.extraBold,
  },
  secondaryText: {
    fontWeight: fontWeights.bold,
  },
});
